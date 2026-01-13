use crate::models::{MeritStats, Settings, WindowPlacement};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Sender};
use std::time::{Duration, Instant};

use super::MeritStorage;

const CURRENT_STATE_VERSION: u32 = 3;

fn default_state_version() -> u32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedState {
    #[serde(default = "default_state_version")]
    version: u32,
    stats: MeritStats,
    settings: Settings,
    #[serde(default)]
    window_placements: BTreeMap<String, WindowPlacement>,
}

static SAVE_TX: Lazy<Mutex<Option<Sender<()>>>> = Lazy::new(|| Mutex::new(None));

pub fn init(storage: std::sync::Arc<parking_lot::RwLock<MeritStorage>>, path: PathBuf) {
    let (tx, rx) = mpsc::channel::<()>();
    *SAVE_TX.lock() = Some(tx);

    std::thread::spawn(move || {
        loop {
            if rx.recv().is_err() {
                break;
            }

            // debounce: coalesce frequent input events into a single write
            let start = Instant::now();
            while start.elapsed() < Duration::from_millis(650) {
                if rx.recv_timeout(Duration::from_millis(80)).is_err() {
                    break;
                }
            }

            if let Err(e) = write_snapshot(&storage, &path) {
                eprintln!("Failed to persist state: {}", e);
            }
        }
    });
}

pub fn request_save() {
    if let Some(tx) = SAVE_TX.lock().as_ref() {
        let _ = tx.send(());
    }
}

pub fn load(
    path: &Path,
) -> io::Result<Option<(MeritStats, Settings, BTreeMap<String, WindowPlacement>)>> {
    if !path.exists() {
        return Ok(None);
    }

    let bytes = fs::read(path)?;
    let mut state: PersistedState = serde_json::from_slice(&bytes)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

    state.stats.normalize_today();
    state.stats.recompute_counters();

    // One-time migration: drop high-cardinality historical fields and move to the latest format.
    // Best-effort only; failure to rewrite shouldn't prevent the app from starting.
    if state.version < CURRENT_STATE_VERSION {
        state.version = CURRENT_STATE_VERSION;
        let _ = write_state_atomically(path, &state);
    }

    Ok(Some((state.stats, state.settings, state.window_placements)))
}

fn write_state_atomically(path: &Path, state: &PersistedState) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let tmp = path.with_extension("tmp");
    let mut file = fs::File::create(&tmp)?;
    serde_json::to_writer(&mut file, state).map_err(|e| io::Error::new(io::ErrorKind::Other, e))?;
    file.write_all(b"\n")?;
    file.sync_all()?;

    let _ = fs::remove_file(path);
    fs::rename(tmp, path)?;
    Ok(())
}

fn write_snapshot(
    storage: &std::sync::Arc<parking_lot::RwLock<MeritStorage>>,
    path: &Path,
) -> io::Result<()> {
    let (stats, settings, window_placements) = {
        let storage = storage.read();
        (
            storage.get_stats(),
            storage.get_settings(),
            storage.get_window_placements(),
        )
    };

    let state = PersistedState {
        version: CURRENT_STATE_VERSION,
        stats,
        settings,
        window_placements,
    };

    write_state_atomically(path, &state)
}
