use std::cell::RefCell;
use std::sync::Arc;

/// Returns the current local date key as `YYYY-MM-DD`.
///
/// This is called from input hot paths (click/keystroke processing). To avoid
/// repeated chrono formatting and allocations, this is cached per-thread and
/// refreshed at most once per second.
pub fn today_key_arc() -> Arc<str> {
    thread_local! {
        static CACHE: RefCell<(u64, Arc<str>)> = RefCell::new((0, Arc::<str>::from("")));
    }

    let now = now_ms();
    CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        if !cache.1.is_empty() && now.saturating_sub(cache.0) < 1_000 {
            return Arc::clone(&cache.1);
        }

        let s = chrono::Local::now().date_naive().to_string();
        let arc: Arc<str> = Arc::from(s);
        *cache = (now, Arc::clone(&arc));
        arc
    })
}

fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
