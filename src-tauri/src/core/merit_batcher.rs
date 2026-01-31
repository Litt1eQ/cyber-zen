use crate::core::merit_storage::{KeyboardCounts, MouseCounts};
use crate::core::MeritStorage;
use crate::models::{InputEvent, InputOrigin, InputSource};
use once_cell::sync::Lazy;
use rand::rngs::SmallRng;
use rand::{Rng, SeedableRng};
use std::collections::HashMap;
use std::sync::mpsc::{self, Sender};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

use super::active_app::AppContext;

const MAX_DIGIT: u64 = 9;
const ANIM_EMIT_INTERVAL: Duration = Duration::from_millis(120);
const STATS_EMIT_INTERVAL: Duration = Duration::from_millis(200);
const IDLE_EVICT_AFTER: Duration = Duration::from_secs(2);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct Key {
    origin: InputOrigin,
    source: InputSource,
}

#[derive(Debug, Clone)]
struct Trigger {
    key: Key,
    count: u64,
    key_code: Option<Arc<str>>,
    is_shifted: Option<bool>,
    shortcut: Option<Arc<str>>,
    app: Option<AppContext>,
    app_handle: AppHandle,
}

#[derive(Debug, Clone)]
struct AnimState {
    pending: u64,
    next_emit_at: Instant,
    last_seen_at: Instant,
    app_handle: AppHandle,
}

pub struct MeritBatcher {
    tx: Sender<Trigger>,
}

impl MeritBatcher {
    fn new() -> Self {
        let (tx, rx) = mpsc::channel::<Trigger>();

        std::thread::spawn(move || {
            let mut rng = SmallRng::seed_from_u64(time_seed());
            let mut anim: HashMap<Key, AnimState> = HashMap::new();

            let mut stats_dirty = false;
            let mut stats_handle: Option<AppHandle> = None;
            let mut last_stats_emit = Instant::now()
                .checked_sub(STATS_EMIT_INTERVAL)
                .unwrap_or_else(Instant::now);

            loop {
                let now = Instant::now();
                let timeout = next_timeout(now, stats_dirty, last_stats_emit, &anim);

                let first = match timeout {
                    Some(timeout) => match rx.recv_timeout(timeout) {
                        Ok(v) => Some(v),
                        Err(mpsc::RecvTimeoutError::Timeout) => None,
                        Err(mpsc::RecvTimeoutError::Disconnected) => return,
                    },
                    None => match rx.recv() {
                        Ok(v) => Some(v),
                        Err(_) => return,
                    },
                };

                    if let Some(first) = first {
                            let mut triggers = vec![first];
                            while let Ok(next) = rx.try_recv() {
                                triggers.push(next);
                            }

                            let started = Instant::now();
                            let triggers_len = triggers.len() as u64;
                            process_triggers(
                                triggers,
                                &mut rng,
                                &mut anim,
                                &mut stats_dirty,
                                &mut stats_handle,
                            );
                            crate::core::perf::record_batch_process(triggers_len, started.elapsed());
                    }

                let now = Instant::now();
                if stats_dirty && now.duration_since(last_stats_emit) >= STATS_EMIT_INTERVAL {
                    if let Some(handle) = stats_handle.as_ref() {
                        emit_stats_updated(handle);
                        last_stats_emit = now;
                        stats_dirty = false;
                    }
                }

                emit_due_anim(now, &mut rng, &mut anim);
            }
        });

        Self { tx }
    }

    pub fn enqueue(
        &self,
        app_handle: AppHandle,
        origin: InputOrigin,
        source: InputSource,
        count: u64,
        key_code: Option<Arc<str>>,
        is_shifted: Option<bool>,
        shortcut: Option<Arc<str>>,
        app: Option<AppContext>,
    ) {
        if count == 0 {
            return;
        }

        let _ = self.tx.send(Trigger {
            key: Key { origin, source },
            count,
            key_code,
            is_shifted,
            shortcut,
            app,
            app_handle,
        });
    }
}

static BATCHER: Lazy<MeritBatcher> = Lazy::new(MeritBatcher::new);

pub fn enqueue_merit_trigger(
    app_handle: AppHandle,
    origin: InputOrigin,
    source: InputSource,
    count: u64,
    key_code: Option<Arc<str>>,
    is_shifted: Option<bool>,
    shortcut: Option<Arc<str>>,
    app: Option<AppContext>,
) {
    crate::core::activity::touch();
    crate::core::perf::inc_enqueue_triggers(count);
    BATCHER.enqueue(
        app_handle, origin, source, count, key_code, is_shifted, shortcut, app,
    );
}

fn process_triggers(
    triggers: Vec<Trigger>,
    rng: &mut SmallRng,
    anim: &mut HashMap<Key, AnimState>,
    stats_dirty: &mut bool,
    stats_handle: &mut Option<AppHandle>,
) {
    let mut by_key: HashMap<Key, (u64, AppHandle)> = HashMap::new();
    let mut by_app: HashMap<(InputOrigin, InputSource, Arc<str>), (u64, Option<Arc<str>>)> =
        HashMap::new();
    let mut keyboard_key_counts: HashMap<InputOrigin, HashMap<Arc<str>, u64>> = HashMap::new();
    let mut keyboard_key_counts_unshifted: HashMap<InputOrigin, HashMap<Arc<str>, u64>> =
        HashMap::new();
    let mut keyboard_key_counts_shifted: HashMap<InputOrigin, HashMap<Arc<str>, u64>> =
        HashMap::new();
    let mut shortcut_counts: HashMap<InputOrigin, HashMap<Arc<str>, u64>> = HashMap::new();
    let mut mouse_button_counts: HashMap<InputOrigin, HashMap<Arc<str>, u64>> = HashMap::new();

    for trigger in triggers {
        if trigger.count == 0 {
            continue;
        }

        if let Some(app) = trigger.app.as_ref() {
            by_app
                .entry((
                    trigger.key.origin,
                    trigger.key.source,
                    Arc::clone(&app.id),
                ))
                .and_modify(|(c, name)| {
                    *c = c.saturating_add(trigger.count);
                    if name.is_none() {
                        *name = app.name.as_ref().map(Arc::clone);
                    }
                })
                .or_insert((trigger.count, app.name.as_ref().map(Arc::clone)));
        }

        if let Some(code) = trigger.key_code.as_ref() {
            match trigger.key.source {
                InputSource::Keyboard => {
                    keyboard_key_counts
                        .entry(trigger.key.origin)
                        .or_default()
                        .entry(Arc::clone(code))
                        .and_modify(|v| *v = v.saturating_add(trigger.count))
                        .or_insert(trigger.count);

                    if let Some(is_shifted) = trigger.is_shifted {
                        if is_shifted {
                            keyboard_key_counts_shifted
                                .entry(trigger.key.origin)
                                .or_default()
                                .entry(Arc::clone(code))
                                .and_modify(|v| *v = v.saturating_add(trigger.count))
                                .or_insert(trigger.count);
                        } else {
                            keyboard_key_counts_unshifted
                                .entry(trigger.key.origin)
                                .or_default()
                                .entry(Arc::clone(code))
                                .and_modify(|v| *v = v.saturating_add(trigger.count))
                                .or_insert(trigger.count);
                        }
                    }
                }
                InputSource::MouseSingle => {
                    mouse_button_counts
                        .entry(trigger.key.origin)
                        .or_default()
                        .entry(Arc::clone(code))
                        .and_modify(|v| *v = v.saturating_add(trigger.count))
                        .or_insert(trigger.count);
                }
            }
        }

        if let Some(shortcut) = trigger.shortcut.as_ref() {
            shortcut_counts
                .entry(trigger.key.origin)
                .or_default()
                .entry(Arc::clone(shortcut))
                .and_modify(|v| *v = v.saturating_add(trigger.count))
                .or_insert(trigger.count);
        }

        by_key
            .entry(trigger.key)
            .and_modify(|(count, handle)| {
                *count = count.saturating_add(trigger.count);
                *handle = trigger.app_handle.clone();
            })
            .or_insert((trigger.count, trigger.app_handle.clone()));

        *stats_handle = Some(trigger.app_handle);
    }

    if by_key.is_empty() {
        return;
    }

    let mut allowed: HashMap<Key, bool> = HashMap::new();
    {
        let storage = MeritStorage::instance();
        let mut storage = storage.write();
        for (key, (count, _)) in &by_key {
            let keyboard = match key.source {
                InputSource::Keyboard => Some(KeyboardCounts {
                    key_counts: keyboard_key_counts.get(&key.origin),
                    key_counts_unshifted: keyboard_key_counts_unshifted.get(&key.origin),
                    key_counts_shifted: keyboard_key_counts_shifted.get(&key.origin),
                    shortcut_counts: shortcut_counts.get(&key.origin),
                }),
                InputSource::MouseSingle => None,
            };

            let mouse = match key.source {
                InputSource::Keyboard => None,
                InputSource::MouseSingle => Some(MouseCounts {
                    mouse_button_counts: mouse_button_counts.get(&key.origin),
                }),
            };

            let added = storage.add_merit_silent(key.origin, key.source, *count, keyboard, mouse);
            allowed.insert(*key, added);
            if added {
                *stats_dirty = true;
            }
        }

        for ((origin, source, app_id), (count, name)) in &by_app {
            let app = AppContext {
                id: Arc::clone(app_id),
                name: name.as_ref().map(Arc::clone),
            };
            if storage.add_app_merit_silent(*origin, *source, *count, Some(&app)) {
                *stats_dirty = true;
            }
        }
    }

    if !*stats_dirty {
        return;
    }

    let now = Instant::now();
    for (key, (count, app_handle)) in by_key {
        if !allowed.get(&key).copied().unwrap_or(false) {
            continue;
        }

        // In-app clicks animate locally for better responsiveness and to avoid duplicate pops.
        if key.origin == InputOrigin::App {
            continue;
        }

        let entry = anim.entry(key).or_insert_with(|| AnimState {
            pending: 0,
            next_emit_at: now,
            last_seen_at: now,
            app_handle: app_handle.clone(),
        });

        let was_idle = entry.pending == 0;
        entry.last_seen_at = now;
        entry.app_handle = app_handle;
        entry.pending = entry.pending.saturating_add(count);

        if was_idle {
            emit_first_anim(key, entry);
        } else if entry.next_emit_at <= now {
            emit_random_anim(key, entry, rng);
        }
    }
}

fn emit_due_anim(now: Instant, rng: &mut SmallRng, anim: &mut HashMap<Key, AnimState>) {
    let mut evict = Vec::new();

    for (key, state) in anim.iter_mut() {
        if state.pending > 0 && now >= state.next_emit_at {
            emit_random_anim(*key, state, rng);
        }

        if state.pending == 0 && now.duration_since(state.last_seen_at) >= IDLE_EVICT_AFTER {
            evict.push(*key);
        }
    }

    for key in evict {
        anim.remove(&key);
    }
}

fn emit_first_anim(key: Key, state: &mut AnimState) {
    let chunk = state.pending.min(MAX_DIGIT);
    state.pending -= chunk;
    state.next_emit_at = Instant::now() + ANIM_EMIT_INTERVAL;
    emit_input_event(&state.app_handle, key, chunk);
}

fn emit_random_anim(key: Key, state: &mut AnimState, rng: &mut SmallRng) {
    let max = state.pending.min(MAX_DIGIT);
    let chunk = rng.gen_range(1..=max);
    state.pending -= chunk;
    state.next_emit_at = Instant::now() + ANIM_EMIT_INTERVAL;
    emit_input_event(&state.app_handle, key, chunk);
}

fn emit_input_event(app_handle: &AppHandle, key: Key, chunk: u64) {
    if chunk == 0 {
        return;
    }

    // Input animation is only relevant for the main window; avoid broadcasting to all windows.
    if !crate::core::main_window_bounds::is_visible() {
        return;
    }
    let Some(window) = app_handle.get_webview_window("main") else {
        return;
    };
    let _ = window.emit(
        "input-event",
        InputEvent {
            origin: key.origin,
            source: key.source,
            count: chunk,
        },
    );
}

fn emit_stats_updated(app_handle: &AppHandle) {
    let stats = {
        let storage = MeritStorage::instance();
        let storage = storage.read();
        storage.get_stats().lite()
    };

    // Avoid broadcasting to all windows; only windows that can render stats need updates.
    if crate::core::main_window_bounds::is_visible() {
        if let Some(window) = app_handle.get_webview_window("main") {
            let _ = window.emit("merit-updated", &stats);
        }
    }
    crate::core::ui_emit::emit_to_any_visible_windows(
        app_handle,
        &["settings", "custom_statistics"],
        "merit-updated",
        &stats,
    );
    crate::core::persistence::request_save();
}

fn next_timeout(
    now: Instant,
    stats_dirty: bool,
    last_stats_emit: Instant,
    anim: &HashMap<Key, AnimState>,
) -> Option<Duration> {
    let mut next_deadline: Option<Instant> = None;

    if stats_dirty {
        next_deadline = Some(last_stats_emit + STATS_EMIT_INTERVAL);
    }

    for state in anim.values() {
        if state.pending > 0 {
            next_deadline = Some(match next_deadline {
                Some(existing) => existing.min(state.next_emit_at),
                None => state.next_emit_at,
            });
        } else {
            let evict_at = state.last_seen_at + IDLE_EVICT_AFTER;
            next_deadline = Some(match next_deadline {
                Some(existing) => existing.min(evict_at),
                None => evict_at,
            });
        }
    }

    match next_deadline {
        Some(deadline) if deadline > now => Some(deadline.duration_since(now)),
        Some(_) => Some(Duration::from_millis(0)),
        None => None,
    }
}

fn time_seed() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64
}
