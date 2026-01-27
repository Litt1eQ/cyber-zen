use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static LAST_ACTIVITY_MS: AtomicU64 = AtomicU64::new(0);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn init() {
    touch();
}

pub fn touch() {
    LAST_ACTIVITY_MS.store(now_ms(), Ordering::Relaxed);
}

pub fn last_activity_ms() -> u64 {
    let v = LAST_ACTIVITY_MS.load(Ordering::Relaxed);
    if v == 0 {
        return now_ms();
    }
    v
}

pub fn idle_for_ms() -> u64 {
    now_ms().saturating_sub(last_activity_ms())
}

