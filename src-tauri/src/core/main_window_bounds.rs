use crate::core::click_heatmap::CoordinateSpace;
use once_cell::sync::Lazy;
use parking_lot::RwLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, WebviewWindow};

#[derive(Debug, Clone, Copy)]
struct Rect {
    left: f64,
    top: f64,
    right: f64,
    bottom: f64,
}

impl Rect {
    fn contains(&self, x: f64, y: f64) -> bool {
        x.is_finite()
            && y.is_finite()
            && self.left.is_finite()
            && self.top.is_finite()
            && self.right.is_finite()
            && self.bottom.is_finite()
            && x >= self.left
            && y >= self.top
            && x < self.right
            && y < self.bottom
    }
}

#[derive(Debug, Clone, Copy, Default)]
struct BoundsState {
    visible: bool,
    physical: Option<Rect>,
    logical: Option<Rect>,
    last_refresh_ms: u64,
}

static STATE: Lazy<RwLock<BoundsState>> = Lazy::new(|| RwLock::new(BoundsState::default()));

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn rect_from_physical(left: f64, top: f64, width: f64, height: f64) -> Option<Rect> {
    if !(left.is_finite() && top.is_finite() && width.is_finite() && height.is_finite()) {
        return None;
    }
    if width <= 0.0 || height <= 0.0 {
        return None;
    }
    Some(Rect {
        left,
        top,
        right: left + width,
        bottom: top + height,
    })
}

fn update_from_window(state: &mut BoundsState, window: &WebviewWindow) {
    // Prefer counting (no suppression) if visibility can't be determined.
    let visible = window.is_visible().unwrap_or(false);
    state.visible = visible;

    let pos = window.outer_position().ok();
    let size = window.outer_size().ok();
    let scale_factor = window.scale_factor().ok();

    state.physical = match (pos, size) {
        (Some(pos), Some(size)) => rect_from_physical(
            pos.x as f64,
            pos.y as f64,
            size.width as f64,
            size.height as f64,
        ),
        _ => None,
    };

    state.logical = match (state.physical, scale_factor) {
        (Some(p), Some(sf)) if sf.is_finite() && sf > 0.0 => rect_from_physical(
            p.left / sf,
            p.top / sf,
            (p.right - p.left) / sf,
            (p.bottom - p.top) / sf,
        ),
        _ => None,
    };

    state.last_refresh_ms = now_ms();
}

pub fn refresh_from_window(window: &WebviewWindow) {
    let mut state = STATE.write();
    update_from_window(&mut state, window);
}

pub fn refresh_from_app_handle(app_handle: &AppHandle) {
    let Some(window) = app_handle.get_webview_window("main") else {
        return;
    };
    refresh_from_window(&window);
}

pub fn refresh_if_stale(app_handle: &AppHandle, min_interval: Duration) {
    let (last, visible, has_rect) = {
        let state = STATE.read();
        (
            state.last_refresh_ms,
            state.visible,
            state.physical.is_some() || state.logical.is_some(),
        )
    };

    let elapsed_ms = now_ms().saturating_sub(last);
    let min_ms = min_interval.as_millis() as u64;
    if elapsed_ms < min_ms && (visible || has_rect) {
        return;
    }

    refresh_from_app_handle(app_handle);
}

pub fn contains_point(space: CoordinateSpace, x: f64, y: f64) -> bool {
    let state = STATE.read();
    if !state.visible {
        return false;
    }
    match space {
        CoordinateSpace::Physical => state.physical.map(|r| r.contains(x, y)).unwrap_or(false),
        CoordinateSpace::Logical => state.logical.map(|r| r.contains(x, y)).unwrap_or(false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rect_contains_works() {
        let r = Rect {
            left: 10.0,
            top: 20.0,
            right: 110.0,
            bottom: 120.0,
        };
        assert!(r.contains(10.0, 20.0));
        assert!(r.contains(109.999, 119.999));
        assert!(!r.contains(110.0, 20.0));
        assert!(!r.contains(10.0, 120.0));
    }
}
