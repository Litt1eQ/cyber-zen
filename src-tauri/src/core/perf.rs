use serde::Serialize;

// Full perf instrumentation is available in debug builds, and optionally in release builds via
// `--features perf`. This keeps release builds clean/lean by default while still allowing
// production profiling when explicitly enabled.

#[cfg(any(debug_assertions, feature = "perf"))]
mod imp {
    use super::Serialize;
    use once_cell::sync::Lazy;
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
    use std::time::{Duration, Instant};

    static ENABLED: AtomicBool = AtomicBool::new(true);
    static STARTED_AT: Lazy<Instant> = Lazy::new(Instant::now);

    // Counters
    static INPUT_EVENTS_TOTAL: AtomicU64 = AtomicU64::new(0);
    static INPUT_EVENTS_KEY: AtomicU64 = AtomicU64::new(0);
    static INPUT_EVENTS_MOUSE_CLICK: AtomicU64 = AtomicU64::new(0);
    static INPUT_EVENTS_MOUSE_MOVE: AtomicU64 = AtomicU64::new(0);

    static ENQUEUE_TRIGGERS_TOTAL: AtomicU64 = AtomicU64::new(0);
    static BATCH_PROCESS_CALLS: AtomicU64 = AtomicU64::new(0);
    static BATCH_PROCESS_TRIGGERS: AtomicU64 = AtomicU64::new(0);

    static PERSIST_REQUESTS: AtomicU64 = AtomicU64::new(0);
    static HEATMAP_CLICKS_RECORDED: AtomicU64 = AtomicU64::new(0);
    static HEATMAP_EMITS: AtomicU64 = AtomicU64::new(0);

    // Timings (nanos + samples)
    static KEYCODE_MAP_NS: AtomicU64 = AtomicU64::new(0);
    static KEYCODE_MAP_SAMPLES: AtomicU64 = AtomicU64::new(0);

    static ACTIVE_APP_NS: AtomicU64 = AtomicU64::new(0);
    static ACTIVE_APP_SAMPLES: AtomicU64 = AtomicU64::new(0);

    static CLICK_HEATMAP_NS: AtomicU64 = AtomicU64::new(0);
    static CLICK_HEATMAP_SAMPLES: AtomicU64 = AtomicU64::new(0);

    static MOUSE_DISTANCE_MOVE_NS: AtomicU64 = AtomicU64::new(0);
    static MOUSE_DISTANCE_MOVE_SAMPLES: AtomicU64 = AtomicU64::new(0);

    static MOUSE_DISTANCE_FLUSH_NS: AtomicU64 = AtomicU64::new(0);
    static MOUSE_DISTANCE_FLUSH_SAMPLES: AtomicU64 = AtomicU64::new(0);

    static BATCH_PROCESS_NS: AtomicU64 = AtomicU64::new(0);
    static BATCH_PROCESS_SAMPLES: AtomicU64 = AtomicU64::new(0);

    #[derive(Debug, Clone, Copy)]
    pub enum TimerKind {
        KeyCodeMap,
        ActiveAppQuery,
        ClickHeatmap,
        MouseDistanceMove,
        MouseDistanceFlush,
        BatchProcess,
    }

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct PerfSnapshot {
        pub supported: bool,
        pub enabled: bool,
        pub uptime_ms: u64,
        pub counters: PerfCounters,
        pub timings: PerfTimings,
    }

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct PerfCounters {
        pub input_events_total: u64,
        pub input_events_key: u64,
        pub input_events_mouse_click: u64,
        pub input_events_mouse_move: u64,
        pub enqueue_triggers_total: u64,
        pub batch_process_calls: u64,
        pub batch_process_triggers: u64,
        pub persist_requests: u64,
        pub heatmap_clicks_recorded: u64,
        pub heatmap_emits: u64,
    }

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct PerfTimings {
        pub keycode_map: PerfTiming,
        pub active_app_query: PerfTiming,
        pub click_heatmap: PerfTiming,
        pub mouse_distance_move: PerfTiming,
        pub mouse_distance_flush: PerfTiming,
        pub batch_process: PerfTiming,
    }

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct PerfTiming {
        pub samples: u64,
        pub total_ns: u64,
        pub avg_ns: u64,
    }

    pub fn is_enabled() -> bool {
        ENABLED.load(Ordering::Relaxed)
    }

    pub fn set_enabled(enabled: bool) {
        ENABLED.store(enabled, Ordering::Relaxed);
    }

    pub fn snapshot() -> PerfSnapshot {
        let enabled = is_enabled();
        let uptime_ms = STARTED_AT.elapsed().as_millis() as u64;

        let counters = PerfCounters {
            input_events_total: INPUT_EVENTS_TOTAL.load(Ordering::Relaxed),
            input_events_key: INPUT_EVENTS_KEY.load(Ordering::Relaxed),
            input_events_mouse_click: INPUT_EVENTS_MOUSE_CLICK.load(Ordering::Relaxed),
            input_events_mouse_move: INPUT_EVENTS_MOUSE_MOVE.load(Ordering::Relaxed),
            enqueue_triggers_total: ENQUEUE_TRIGGERS_TOTAL.load(Ordering::Relaxed),
            batch_process_calls: BATCH_PROCESS_CALLS.load(Ordering::Relaxed),
            batch_process_triggers: BATCH_PROCESS_TRIGGERS.load(Ordering::Relaxed),
            persist_requests: PERSIST_REQUESTS.load(Ordering::Relaxed),
            heatmap_clicks_recorded: HEATMAP_CLICKS_RECORDED.load(Ordering::Relaxed),
            heatmap_emits: HEATMAP_EMITS.load(Ordering::Relaxed),
        };

        let keycode_map = timing(&KEYCODE_MAP_NS, &KEYCODE_MAP_SAMPLES);
        let active_app_query = timing(&ACTIVE_APP_NS, &ACTIVE_APP_SAMPLES);
        let click_heatmap = timing(&CLICK_HEATMAP_NS, &CLICK_HEATMAP_SAMPLES);
        let mouse_distance_move = timing(&MOUSE_DISTANCE_MOVE_NS, &MOUSE_DISTANCE_MOVE_SAMPLES);
        let mouse_distance_flush = timing(&MOUSE_DISTANCE_FLUSH_NS, &MOUSE_DISTANCE_FLUSH_SAMPLES);
        let batch_process = timing(&BATCH_PROCESS_NS, &BATCH_PROCESS_SAMPLES);

        PerfSnapshot {
            supported: true,
            enabled,
            uptime_ms,
            counters,
            timings: PerfTimings {
                keycode_map,
                active_app_query,
                click_heatmap,
                mouse_distance_move,
                mouse_distance_flush,
                batch_process,
            },
        }
    }

    fn timing(total: &AtomicU64, samples: &AtomicU64) -> PerfTiming {
        let total_ns = total.load(Ordering::Relaxed);
        let samples = samples.load(Ordering::Relaxed);
        let avg_ns = if samples > 0 { total_ns / samples } else { 0 };
        PerfTiming {
            samples,
            total_ns,
            avg_ns,
        }
    }

    pub fn inc_input_key() {
        if !is_enabled() {
            return;
        }
        INPUT_EVENTS_TOTAL.fetch_add(1, Ordering::Relaxed);
        INPUT_EVENTS_KEY.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_input_mouse_click() {
        if !is_enabled() {
            return;
        }
        INPUT_EVENTS_TOTAL.fetch_add(1, Ordering::Relaxed);
        INPUT_EVENTS_MOUSE_CLICK.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_input_mouse_move() {
        if !is_enabled() {
            return;
        }
        INPUT_EVENTS_TOTAL.fetch_add(1, Ordering::Relaxed);
        INPUT_EVENTS_MOUSE_MOVE.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_enqueue_triggers(count: u64) {
        if !is_enabled() {
            return;
        }
        ENQUEUE_TRIGGERS_TOTAL.fetch_add(count, Ordering::Relaxed);
    }

    pub fn inc_persist_requests() {
        if !is_enabled() {
            return;
        }
        PERSIST_REQUESTS.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_heatmap_click_recorded() {
        if !is_enabled() {
            return;
        }
        HEATMAP_CLICKS_RECORDED.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_heatmap_emit() {
        if !is_enabled() {
            return;
        }
        HEATMAP_EMITS.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_batch_process(triggers: u64, duration: Duration) {
        if !is_enabled() {
            return;
        }
        BATCH_PROCESS_CALLS.fetch_add(1, Ordering::Relaxed);
        BATCH_PROCESS_TRIGGERS.fetch_add(triggers, Ordering::Relaxed);
        record_duration(TimerKind::BatchProcess, duration);
    }

    pub fn record_duration(kind: TimerKind, duration: Duration) {
        if !is_enabled() {
            return;
        }
        let ns = duration.as_nanos() as u64;
        match kind {
            TimerKind::KeyCodeMap => {
                KEYCODE_MAP_NS.fetch_add(ns, Ordering::Relaxed);
                KEYCODE_MAP_SAMPLES.fetch_add(1, Ordering::Relaxed);
            }
            TimerKind::ActiveAppQuery => {
                ACTIVE_APP_NS.fetch_add(ns, Ordering::Relaxed);
                ACTIVE_APP_SAMPLES.fetch_add(1, Ordering::Relaxed);
            }
            TimerKind::ClickHeatmap => {
                CLICK_HEATMAP_NS.fetch_add(ns, Ordering::Relaxed);
                CLICK_HEATMAP_SAMPLES.fetch_add(1, Ordering::Relaxed);
            }
            TimerKind::MouseDistanceMove => {
                MOUSE_DISTANCE_MOVE_NS.fetch_add(ns, Ordering::Relaxed);
                MOUSE_DISTANCE_MOVE_SAMPLES.fetch_add(1, Ordering::Relaxed);
            }
            TimerKind::MouseDistanceFlush => {
                MOUSE_DISTANCE_FLUSH_NS.fetch_add(ns, Ordering::Relaxed);
                MOUSE_DISTANCE_FLUSH_SAMPLES.fetch_add(1, Ordering::Relaxed);
            }
            TimerKind::BatchProcess => {
                BATCH_PROCESS_NS.fetch_add(ns, Ordering::Relaxed);
                BATCH_PROCESS_SAMPLES.fetch_add(1, Ordering::Relaxed);
            }
        }
    }

    pub fn time<F, T>(kind: TimerKind, f: F) -> T
    where
        F: FnOnce() -> T,
    {
        if !is_enabled() {
            return f();
        }
        let start = Instant::now();
        let out = f();
        record_duration(kind, start.elapsed());
        out
    }
}

#[cfg(not(any(debug_assertions, feature = "perf")))]
mod imp {
    use super::Serialize;
    use once_cell::sync::Lazy;
    use std::time::{Duration, Instant};

    static STARTED_AT: Lazy<Instant> = Lazy::new(Instant::now);

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct PerfSnapshot {
        pub supported: bool,
        pub enabled: bool,
        pub uptime_ms: u64,
    }

    #[derive(Debug, Clone, Copy)]
    pub enum TimerKind {
        KeyCodeMap,
        ActiveAppQuery,
        ClickHeatmap,
        MouseDistanceMove,
        MouseDistanceFlush,
        BatchProcess,
    }

    pub fn is_enabled() -> bool {
        false
    }

    pub fn snapshot() -> PerfSnapshot {
        // Keep the behavior stable for the UI (enabled=false, minimal fields), but avoid
        // compile-time warnings by using the same public API surface that callers rely on.
        PerfSnapshot {
            supported: false,
            enabled: is_enabled(),
            uptime_ms: STARTED_AT.elapsed().as_millis() as u64,
        }
    }

    pub fn inc_input_key() {}
    pub fn inc_input_mouse_click() {}
    pub fn inc_input_mouse_move() {}
    pub fn inc_enqueue_triggers(_count: u64) {}
    pub fn inc_persist_requests() {}
    pub fn inc_heatmap_click_recorded() {}
    pub fn inc_heatmap_emit() {}

    pub fn record_batch_process(_triggers: u64, _duration: Duration) {
        // Ensure the enum variant is referenced in non-perf builds too.
        record_duration(TimerKind::BatchProcess, Duration::from_nanos(0));
    }

    pub fn record_duration(_kind: TimerKind, _duration: Duration) {}

    pub fn time<F, T>(kind: TimerKind, f: F) -> T
    where
        F: FnOnce() -> T,
    {
        // Keep the signature stable so call sites don't need cfgs.
        record_duration(kind, Duration::from_nanos(0));
        f()
    }
}

pub type PerfSnapshot = imp::PerfSnapshot;
pub type TimerKind = imp::TimerKind;

pub fn snapshot() -> PerfSnapshot {
    imp::snapshot()
}

pub fn set_enabled(enabled: bool) -> Result<(), String> {
    #[cfg(any(debug_assertions, feature = "perf"))]
    {
        imp::set_enabled(enabled);
        Ok(())
    }

    #[cfg(not(any(debug_assertions, feature = "perf")))]
    {
        let _ = enabled;
        Err("perf not supported in this build".to_string())
    }
}

pub fn inc_input_key() {
    imp::inc_input_key()
}

pub fn inc_input_mouse_click() {
    imp::inc_input_mouse_click()
}

pub fn inc_input_mouse_move() {
    imp::inc_input_mouse_move()
}

pub fn inc_enqueue_triggers(count: u64) {
    imp::inc_enqueue_triggers(count)
}

pub fn inc_persist_requests() {
    imp::inc_persist_requests()
}

pub fn inc_heatmap_click_recorded() {
    imp::inc_heatmap_click_recorded()
}

pub fn inc_heatmap_emit() {
    imp::inc_heatmap_emit()
}

pub fn record_batch_process(triggers: u64, duration: std::time::Duration) {
    imp::record_batch_process(triggers, duration)
}

pub fn time<F, T>(kind: TimerKind, f: F) -> T
where
    F: FnOnce() -> T,
{
    imp::time(kind, f)
}
