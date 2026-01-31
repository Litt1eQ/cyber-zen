use once_cell::sync::Lazy;
use parking_lot::Mutex;
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;

const DEFAULT_CAPACITY: usize = 4096;

struct InternCache {
    cap: usize,
    map: HashMap<String, Arc<str>>,
    order: VecDeque<String>,
}

impl InternCache {
    fn new(cap: usize) -> Self {
        Self {
            cap: cap.max(64),
            map: HashMap::new(),
            order: VecDeque::new(),
        }
    }

    fn intern_owned(&mut self, s: String) -> Arc<str> {
        if let Some(existing) = self.map.get(s.as_str()) {
            return Arc::clone(existing);
        }

        let arc: Arc<str> = Arc::from(s.as_str());
        self.map.insert(s.clone(), Arc::clone(&arc));
        self.order.push_back(s);

        while self.map.len() > self.cap {
            if let Some(evict) = self.order.pop_front() {
                self.map.remove(evict.as_str());
            } else {
                break;
            }
        }

        arc
    }

    fn intern_str(&mut self, s: &str) -> Arc<str> {
        if let Some(existing) = self.map.get(s) {
            return Arc::clone(existing);
        }

        let owned = s.to_string();
        self.intern_owned(owned)
    }
}

static CACHE: Lazy<Mutex<InternCache>> = Lazy::new(|| Mutex::new(InternCache::new(DEFAULT_CAPACITY)));

pub fn intern_str(s: &str) -> Arc<str> {
    CACHE.lock().intern_str(s)
}
