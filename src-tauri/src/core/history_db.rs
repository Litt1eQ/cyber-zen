use crate::models::{ClickHeatmapState, DailyStats};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use rusqlite::{params, Connection, OpenFlags};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Sender};
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug)]
enum DbOp {
    BulkUpsertDaily(Vec<DailyStats>),
    ClearDaily,
    HeatmapDelta {
        date_key: String,
        display_id: String,
        idx: u32,
        delta: u32,
    },
    MigrateLegacyHeatmap {
        state: ClickHeatmapState,
        reply: Sender<Result<(), String>>,
    },
    ClearHeatmap {
        display_id: Option<String>,
        date_key: Option<String>,
        reply: Sender<Result<(), String>>,
    },
    Vacuum,
}

#[derive(Clone)]
struct DbContext {
    path: PathBuf,
    tx: Sender<DbOp>,
}

static CTX: Lazy<Mutex<Option<DbContext>>> = Lazy::new(|| Mutex::new(None));

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn open_write_conn(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| format!("Failed to open sqlite db: {}", e))?;
    let _ = conn.busy_timeout(Duration::from_secs(2));
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("Failed to set journal_mode=WAL: {}", e))?;
    conn.pragma_update(None, "synchronous", "NORMAL")
        .map_err(|e| format!("Failed to set synchronous=NORMAL: {}", e))?;
    conn.pragma_update(None, "temp_store", "MEMORY")
        .map_err(|e| format!("Failed to set temp_store=MEMORY: {}", e))?;
    Ok(conn)
}

fn open_read_conn(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| format!("Failed to open sqlite db (read-only): {}", e))?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_stats (
  date_key TEXT PRIMARY KEY,
  total INTEGER NOT NULL,
  keyboard INTEGER NOT NULL,
  mouse_single INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date_key DESC);

CREATE TABLE IF NOT EXISTS daily_key_counts (
  date_key TEXT NOT NULL,
  kind INTEGER NOT NULL,
  code TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY(date_key, kind, code)
);
CREATE INDEX IF NOT EXISTS idx_daily_key_counts_kind_date ON daily_key_counts(kind, date_key);

CREATE TABLE IF NOT EXISTS daily_shortcut_counts (
  date_key TEXT NOT NULL,
  shortcut TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY(date_key, shortcut)
);
CREATE INDEX IF NOT EXISTS idx_daily_shortcut_counts_date ON daily_shortcut_counts(date_key);

CREATE TABLE IF NOT EXISTS daily_mouse_button_counts (
  date_key TEXT NOT NULL,
  button TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY(date_key, button)
);
CREATE INDEX IF NOT EXISTS idx_daily_mouse_button_counts_date ON daily_mouse_button_counts(date_key);

CREATE TABLE IF NOT EXISTS daily_hourly (
  date_key TEXT NOT NULL,
  hour INTEGER NOT NULL,
  total INTEGER NOT NULL,
  keyboard INTEGER NOT NULL,
  mouse_single INTEGER NOT NULL,
  PRIMARY KEY(date_key, hour)
);
CREATE INDEX IF NOT EXISTS idx_daily_hourly_date ON daily_hourly(date_key);

CREATE TABLE IF NOT EXISTS daily_app_input (
  date_key TEXT NOT NULL,
  app_id TEXT NOT NULL,
  name TEXT,
  keyboard INTEGER NOT NULL,
  mouse_single INTEGER NOT NULL,
  PRIMARY KEY(date_key, app_id)
);
CREATE INDEX IF NOT EXISTS idx_daily_app_input_date ON daily_app_input(date_key);
CREATE INDEX IF NOT EXISTS idx_daily_app_input_app ON daily_app_input(app_id);

CREATE TABLE IF NOT EXISTS app_meta (
  app_id TEXT PRIMARY KEY,
  last_name TEXT,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS click_heatmap_total_cells (
  display_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY(display_id, idx)
);

CREATE TABLE IF NOT EXISTS click_heatmap_daily_cells (
  date_key TEXT NOT NULL,
  display_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY(date_key, display_id, idx)
);

CREATE TABLE IF NOT EXISTS click_heatmap_total_meta (
  display_id TEXT PRIMARY KEY,
  total_clicks INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS click_heatmap_daily_meta (
  date_key TEXT NOT NULL,
  display_id TEXT NOT NULL,
  total_clicks INTEGER NOT NULL,
  PRIMARY KEY(date_key, display_id)
);

CREATE INDEX IF NOT EXISTS idx_click_heatmap_daily_date ON click_heatmap_daily_meta(date_key);
"#,
    )
    .map_err(|e| format!("Failed to migrate sqlite schema: {}", e))?;

    Ok(())
}

fn strip_heavy_fields_for_storage(mut day: DailyStats) -> DailyStats {
    day.key_counts.clear();
    day.key_counts_unshifted.clear();
    day.key_counts_shifted.clear();
    day.shortcut_counts.clear();
    day.mouse_button_counts.clear();
    day.hourly.clear();
    day.app_input_counts.clear();
    day
}

fn replace_daily_key_counts(
    conn: &Connection,
    date_key: &str,
    kind: i64,
    counts: &std::collections::HashMap<String, u64>,
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM daily_key_counts WHERE date_key=?1 AND kind=?2",
        params![date_key, kind],
    )
    .map_err(|e| format!("Failed to clear daily_key_counts: {}", e))?;

    let mut stmt = conn
        .prepare("INSERT INTO daily_key_counts(date_key, kind, code, count) VALUES (?1, ?2, ?3, ?4)")
        .map_err(|e| format!("Failed to prepare daily_key_counts insert: {}", e))?;

    for (code, count) in counts {
        if *count == 0 {
            continue;
        }
        stmt.execute(params![
            date_key,
            kind,
            code,
            i64::try_from(*count).unwrap_or(i64::MAX)
        ])
        .map_err(|e| format!("Failed to insert daily_key_counts: {}", e))?;
    }

    Ok(())
}

fn replace_daily_shortcut_counts(
    conn: &Connection,
    date_key: &str,
    counts: &std::collections::HashMap<String, u64>,
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM daily_shortcut_counts WHERE date_key=?1",
        params![date_key],
    )
    .map_err(|e| format!("Failed to clear daily_shortcut_counts: {}", e))?;

    let mut stmt = conn
        .prepare("INSERT INTO daily_shortcut_counts(date_key, shortcut, count) VALUES (?1, ?2, ?3)")
        .map_err(|e| format!("Failed to prepare daily_shortcut_counts insert: {}", e))?;

    for (shortcut, count) in counts {
        if *count == 0 {
            continue;
        }
        let key = shortcut.trim();
        if key.is_empty() {
            continue;
        }
        stmt.execute(params![
            date_key,
            key,
            i64::try_from(*count).unwrap_or(i64::MAX)
        ])
        .map_err(|e| format!("Failed to insert daily_shortcut_counts: {}", e))?;
    }
    Ok(())
}

fn replace_daily_mouse_button_counts(
    conn: &Connection,
    date_key: &str,
    counts: &std::collections::HashMap<String, u64>,
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM daily_mouse_button_counts WHERE date_key=?1",
        params![date_key],
    )
    .map_err(|e| format!("Failed to clear daily_mouse_button_counts: {}", e))?;

    let mut stmt = conn
        .prepare(
            "INSERT INTO daily_mouse_button_counts(date_key, button, count) VALUES (?1, ?2, ?3)",
        )
        .map_err(|e| format!("Failed to prepare daily_mouse_button_counts insert: {}", e))?;

    for (button, count) in counts {
        if *count == 0 {
            continue;
        }
        let key = button.trim();
        if key.is_empty() {
            continue;
        }
        stmt.execute(params![
            date_key,
            key,
            i64::try_from(*count).unwrap_or(i64::MAX)
        ])
        .map_err(|e| format!("Failed to insert daily_mouse_button_counts: {}", e))?;
    }
    Ok(())
}

fn replace_daily_hourly(conn: &Connection, date_key: &str, hourly: &[crate::models::merit::HourlyStats]) -> Result<(), String> {
    conn.execute("DELETE FROM daily_hourly WHERE date_key=?1", params![date_key])
        .map_err(|e| format!("Failed to clear daily_hourly: {}", e))?;

    let mut stmt = conn
        .prepare("INSERT INTO daily_hourly(date_key, hour, total, keyboard, mouse_single) VALUES (?1, ?2, ?3, ?4, ?5)")
        .map_err(|e| format!("Failed to prepare daily_hourly insert: {}", e))?;

    for (idx, b) in hourly.iter().enumerate().take(24) {
        let hour = i64::try_from(idx).unwrap_or(0);
        let total = i64::try_from(b.total).unwrap_or(i64::MAX);
        let keyboard = i64::try_from(b.keyboard).unwrap_or(i64::MAX);
        let mouse_single = i64::try_from(b.mouse_single).unwrap_or(i64::MAX);
        if total == 0 && keyboard == 0 && mouse_single == 0 {
            continue;
        }
        stmt.execute(params![date_key, hour, total, keyboard, mouse_single])
            .map_err(|e| format!("Failed to insert daily_hourly: {}", e))?;
    }
    Ok(())
}

fn replace_daily_app_input(
    conn: &Connection,
    date_key: &str,
    counts: &std::collections::HashMap<String, crate::models::merit::AppInputStats>,
) -> Result<(), String> {
    conn.execute("DELETE FROM daily_app_input WHERE date_key=?1", params![date_key])
        .map_err(|e| format!("Failed to clear daily_app_input: {}", e))?;

    let mut stmt = conn
        .prepare(
            "INSERT INTO daily_app_input(date_key, app_id, name, keyboard, mouse_single) VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .map_err(|e| format!("Failed to prepare daily_app_input insert: {}", e))?;

    let mut meta_stmt = conn
        .prepare(
            "INSERT INTO app_meta(app_id, last_name, updated_at_ms) VALUES (?1, ?2, ?3) ON CONFLICT(app_id) DO UPDATE SET last_name=excluded.last_name, updated_at_ms=excluded.updated_at_ms",
        )
        .map_err(|e| format!("Failed to prepare app_meta upsert: {}", e))?;

    for (app_id, v) in counts {
        let trimmed = app_id.trim();
        if trimmed.is_empty() {
            continue;
        }

        let keyboard = i64::try_from(v.keyboard).unwrap_or(i64::MAX);
        let mouse_single = i64::try_from(v.mouse_single).unwrap_or(i64::MAX);
        let name = v
            .name
            .as_deref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty());

        stmt.execute(params![date_key, trimmed, name, keyboard, mouse_single])
            .map_err(|e| format!("Failed to insert daily_app_input: {}", e))?;

        if let Some(name) = name {
            let _ = meta_stmt.execute(params![trimmed, name, now_ms()]);
        }
    }

    Ok(())
}

fn upsert_daily(conn: &Connection, day: &DailyStats) -> Result<(), String> {
    let date_key = day.date.to_string();
    let total = i64::try_from(day.total).unwrap_or(i64::MAX);
    let keyboard = i64::try_from(day.keyboard).unwrap_or(i64::MAX);
    let mouse_single = i64::try_from(day.mouse_single).unwrap_or(i64::MAX);
    let payload_json = serde_json::to_string(&strip_heavy_fields_for_storage(day.clone()))
        .map_err(|e| format!("Failed to serialize daily stats: {}", e))?;

    conn.execute(
        r#"
INSERT INTO daily_stats(date_key, total, keyboard, mouse_single, payload_json, updated_at_ms)
VALUES (?1, ?2, ?3, ?4, ?5, ?6)
ON CONFLICT(date_key) DO UPDATE SET
  total=excluded.total,
  keyboard=excluded.keyboard,
  mouse_single=excluded.mouse_single,
  payload_json=excluded.payload_json,
  updated_at_ms=excluded.updated_at_ms
"#,
        params![date_key, total, keyboard, mouse_single, payload_json, now_ms()],
    )
    .map_err(|e| format!("Failed to upsert daily_stats: {}", e))?;

    // Normalize heavy counters for aggregation queries.
    replace_daily_key_counts(conn, &date_key, 0, &day.key_counts)?;
    let unshifted = if !day.key_counts_unshifted.is_empty() {
        &day.key_counts_unshifted
    } else {
        &day.key_counts
    };
    replace_daily_key_counts(conn, &date_key, 1, unshifted)?;
    replace_daily_key_counts(conn, &date_key, 2, &day.key_counts_shifted)?;
    replace_daily_shortcut_counts(conn, &date_key, &day.shortcut_counts)?;
    replace_daily_mouse_button_counts(conn, &date_key, &day.mouse_button_counts)?;
    replace_daily_hourly(conn, &date_key, &day.hourly)?;
    replace_daily_app_input(conn, &date_key, &day.app_input_counts)?;

    Ok(())
}

fn migrate_daily_counters_v2(conn: &mut Connection) -> Result<(), String> {
    let already: bool = conn
        .query_row(
            "SELECT value FROM schema_meta WHERE key='daily_counters_normalized_v2'",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .is_some_and(|v| v.trim() == "1");
    if already {
        return Ok(());
    }

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start sqlite transaction: {}", e))?;

    {
        let mut stmt = tx
            .prepare("SELECT date_key, payload_json FROM daily_stats")
            .map_err(|e| format!("Failed to prepare daily_stats scan: {}", e))?;
        let rows = stmt
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
            .map_err(|e| format!("Failed to scan daily_stats: {}", e))?;

        for row in rows {
            let (date_key, json) =
                row.map_err(|e| format!("Failed to read daily_stats row: {}", e))?;
            let day = match serde_json::from_str::<DailyStats>(&json) {
                Ok(v) => v,
                Err(_) => continue,
            };

            replace_daily_key_counts(&tx, &date_key, 0, &day.key_counts)?;
            let unshifted = if !day.key_counts_unshifted.is_empty() {
                &day.key_counts_unshifted
            } else {
                &day.key_counts
            };
            replace_daily_key_counts(&tx, &date_key, 1, unshifted)?;
            replace_daily_key_counts(&tx, &date_key, 2, &day.key_counts_shifted)?;
            replace_daily_shortcut_counts(&tx, &date_key, &day.shortcut_counts)?;
            replace_daily_mouse_button_counts(&tx, &date_key, &day.mouse_button_counts)?;
            replace_daily_hourly(&tx, &date_key, &day.hourly)?;
            replace_daily_app_input(&tx, &date_key, &day.app_input_counts)?;

            let stripped_json = serde_json::to_string(&strip_heavy_fields_for_storage(day))
                .map_err(|e| format!("Failed to serialize stripped daily stats: {}", e))?;
            let _ = tx.execute(
                "UPDATE daily_stats SET payload_json=?2, updated_at_ms=?3 WHERE date_key=?1",
                params![date_key, stripped_json, now_ms()],
            );
        }
    }

    let _ = tx.execute(
        "INSERT INTO schema_meta(key, value) VALUES('daily_counters_normalized_v2', '1') ON CONFLICT(key) DO UPDATE SET value='1'",
        [],
    );
    tx.commit()
        .map_err(|e| format!("Failed to commit daily counters migration: {}", e))?;
    Ok(())
}

fn apply_heatmap_batch(
    conn: &mut Connection,
    total_cells: HashMap<(String, u32), u32>,
    daily_cells: HashMap<(String, String, u32), u32>,
    total_clicks: HashMap<String, u64>,
    daily_clicks: HashMap<(String, String), u64>,
) -> Result<(), String> {
    if total_cells.is_empty() && daily_cells.is_empty() && total_clicks.is_empty() && daily_clicks.is_empty() {
        return Ok(());
    }

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start sqlite transaction: {}", e))?;

    {
        let mut stmt = tx
            .prepare(
                r#"
INSERT INTO click_heatmap_total_cells(display_id, idx, count)
VALUES (?1, ?2, ?3)
ON CONFLICT(display_id, idx) DO UPDATE SET count = count + excluded.count
"#,
            )
            .map_err(|e| format!("Failed to prepare click_heatmap_total_cells upsert: {}", e))?;
        for ((display_id, idx), delta) in total_cells {
            if delta == 0 {
                continue;
            }
            stmt.execute(params![display_id, idx as i64, delta as i64])
                .map_err(|e| format!("Failed to upsert click_heatmap_total_cells: {}", e))?;
        }
    }

    {
        let mut stmt = tx
            .prepare(
                r#"
INSERT INTO click_heatmap_daily_cells(date_key, display_id, idx, count)
VALUES (?1, ?2, ?3, ?4)
ON CONFLICT(date_key, display_id, idx) DO UPDATE SET count = count + excluded.count
"#,
            )
            .map_err(|e| format!("Failed to prepare click_heatmap_daily_cells upsert: {}", e))?;
        for ((date_key, display_id, idx), delta) in daily_cells {
            if delta == 0 {
                continue;
            }
            stmt.execute(params![date_key, display_id, idx as i64, delta as i64])
                .map_err(|e| format!("Failed to upsert click_heatmap_daily_cells: {}", e))?;
        }
    }

    {
        let mut stmt = tx
            .prepare(
                r#"
INSERT INTO click_heatmap_total_meta(display_id, total_clicks)
VALUES (?1, ?2)
ON CONFLICT(display_id) DO UPDATE SET total_clicks = total_clicks + excluded.total_clicks
"#,
            )
            .map_err(|e| format!("Failed to prepare click_heatmap_total_meta upsert: {}", e))?;
        for (display_id, delta) in total_clicks {
            if delta == 0 {
                continue;
            }
            stmt.execute(params![display_id, delta as i64])
                .map_err(|e| format!("Failed to upsert click_heatmap_total_meta: {}", e))?;
        }
    }

    {
        let mut stmt = tx
            .prepare(
                r#"
INSERT INTO click_heatmap_daily_meta(date_key, display_id, total_clicks)
VALUES (?1, ?2, ?3)
ON CONFLICT(date_key, display_id) DO UPDATE SET total_clicks = total_clicks + excluded.total_clicks
"#,
            )
            .map_err(|e| format!("Failed to prepare click_heatmap_daily_meta upsert: {}", e))?;
        for ((date_key, display_id), delta) in daily_clicks {
            if delta == 0 {
                continue;
            }
            stmt.execute(params![date_key, display_id, delta as i64])
                .map_err(|e| format!("Failed to upsert click_heatmap_daily_meta: {}", e))?;
        }
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit sqlite transaction: {}", e))?;
    Ok(())
}

fn migrate_legacy_heatmap(conn: &mut Connection, state: &ClickHeatmapState) -> Result<(), String> {
    let already: bool = conn
        .query_row(
            "SELECT value FROM schema_meta WHERE key='legacy_click_heatmap_migrated_v1'",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .is_some_and(|v| v.trim() == "1");
    if already {
        return Ok(());
    }

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start sqlite transaction: {}", e))?;

    {
        let mut stmt_cell = tx
            .prepare(
                r#"
INSERT INTO click_heatmap_total_cells(display_id, idx, count)
VALUES (?1, ?2, ?3)
ON CONFLICT(display_id, idx) DO UPDATE SET count = excluded.count
"#,
            )
            .map_err(|e| format!("Failed to prepare legacy total cell upsert: {}", e))?;
        let mut stmt_meta = tx
            .prepare(
                r#"
INSERT INTO click_heatmap_total_meta(display_id, total_clicks)
VALUES (?1, ?2)
ON CONFLICT(display_id) DO UPDATE SET total_clicks = excluded.total_clicks
"#,
            )
            .map_err(|e| format!("Failed to prepare legacy total meta upsert: {}", e))?;

        for (display_id, display) in &state.displays {
            stmt_meta
                .execute(params![display_id, display.total_clicks as i64])
                .map_err(|e| format!("Failed to upsert legacy total meta: {}", e))?;
            for (idx, &count) in display.grid.iter().enumerate() {
                if count == 0 {
                    continue;
                }
                stmt_cell
                    .execute(params![display_id, idx as i64, count as i64])
                    .map_err(|e| format!("Failed to upsert legacy total cell: {}", e))?;
            }
        }
    }

    {
        let mut stmt_cell = tx
            .prepare(
                r#"
INSERT INTO click_heatmap_daily_cells(date_key, display_id, idx, count)
VALUES (?1, ?2, ?3, ?4)
ON CONFLICT(date_key, display_id, idx) DO UPDATE SET count = excluded.count
"#,
            )
            .map_err(|e| format!("Failed to prepare legacy daily cell upsert: {}", e))?;
        let mut stmt_meta = tx
            .prepare(
                r#"
INSERT INTO click_heatmap_daily_meta(date_key, display_id, total_clicks)
VALUES (?1, ?2, ?3)
ON CONFLICT(date_key, display_id) DO UPDATE SET total_clicks = excluded.total_clicks
"#,
            )
            .map_err(|e| format!("Failed to prepare legacy daily meta upsert: {}", e))?;

        for (date_key, day) in &state.daily {
            for (display_id, display) in &day.displays {
                stmt_meta
                    .execute(params![date_key, display_id, display.total_clicks as i64])
                    .map_err(|e| format!("Failed to upsert legacy daily meta: {}", e))?;
                for (idx, &count) in display.grid.iter().enumerate() {
                    if count == 0 {
                        continue;
                    }
                    stmt_cell
                        .execute(params![date_key, display_id, idx as i64, count as i64])
                        .map_err(|e| format!("Failed to upsert legacy daily cell: {}", e))?;
                }
            }
        }
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit legacy heatmap migration: {}", e))?;

    let _ = conn.execute(
        "INSERT INTO schema_meta(key, value) VALUES('legacy_click_heatmap_migrated_v1', '1') ON CONFLICT(key) DO UPDATE SET value='1'",
        [],
    );
    Ok(())
}

pub fn init(path: PathBuf) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create db dir {}: {}", parent.display(), e))?;
    }

    let (tx, rx) = mpsc::channel::<DbOp>();
    let write_path = path.clone();

    // Create schema eagerly to fail fast if the filesystem/db is broken.
    {
        let conn = open_write_conn(&write_path)?;
        migrate(&conn)?;
    }

    std::thread::spawn(move || {
        let mut conn = match open_write_conn(&write_path) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("{}", e);
                return;
            }
        };

        if let Err(e) = migrate(&conn) {
            eprintln!("{}", e);
            return;
        }

        if let Err(e) = migrate_daily_counters_v2(&mut conn) {
            eprintln!("{}", e);
        }

        let mut pending_total_cells: HashMap<(String, u32), u32> = HashMap::new();
        let mut pending_daily_cells: HashMap<(String, String, u32), u32> = HashMap::new();
        let mut pending_total_clicks: HashMap<String, u64> = HashMap::new();
        let mut pending_daily_clicks: HashMap<(String, String), u64> = HashMap::new();

        let mut last_flush_ms = now_ms();

        loop {
            let op = match rx.recv_timeout(Duration::from_millis(120)) {
                Ok(op) => Some(op),
                Err(mpsc::RecvTimeoutError::Timeout) => None,
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            };

            if let Some(op) = op {
                match op {
                    DbOp::BulkUpsertDaily(days) => {
                        let tx = match conn.transaction() {
                            Ok(tx) => tx,
                            Err(e) => {
                                eprintln!("Failed to start sqlite transaction: {}", e);
                                continue;
                            }
                        };
                        for day in &days {
                            if let Err(e) = upsert_daily(&tx, day) {
                                eprintln!("{}", e);
                            }
                        }
                        if let Err(e) = tx.commit() {
                            eprintln!("Failed to commit sqlite transaction: {}", e);
                        }
                    }
                    DbOp::ClearDaily => {
                        let res = (|| -> Result<(), String> {
                            let tx = conn
                                .transaction()
                                .map_err(|e| format!("Failed to start sqlite transaction: {}", e))?;
                            let _ = tx.execute("DELETE FROM daily_key_counts", []);
                            let _ = tx.execute("DELETE FROM daily_shortcut_counts", []);
                            let _ = tx.execute("DELETE FROM daily_mouse_button_counts", []);
                            let _ = tx.execute("DELETE FROM daily_hourly", []);
                            let _ = tx.execute("DELETE FROM daily_app_input", []);
                            let _ = tx.execute("DELETE FROM app_meta", []);
                            let _ = tx.execute("DELETE FROM daily_stats", []);
                            tx.commit()
                                .map_err(|e| format!("Failed to commit sqlite transaction: {}", e))?;
                            Ok(())
                        })();
                        if let Err(e) = res {
                            eprintln!("{}", e);
                        }
                    }
                    DbOp::HeatmapDelta {
                        date_key,
                        display_id,
                        idx,
                        delta,
                    } => {
                        if delta == 0 {
                            continue;
                        }
                        pending_total_cells
                            .entry((display_id.clone(), idx))
                            .and_modify(|v| *v = v.saturating_add(delta))
                            .or_insert(delta);
                        pending_daily_cells
                            .entry((date_key.clone(), display_id.clone(), idx))
                            .and_modify(|v| *v = v.saturating_add(delta))
                            .or_insert(delta);

                        pending_total_clicks
                            .entry(display_id.clone())
                            .and_modify(|v| *v = v.saturating_add(delta as u64))
                            .or_insert(delta as u64);
                        pending_daily_clicks
                            .entry((date_key, display_id))
                            .and_modify(|v| *v = v.saturating_add(delta as u64))
                            .or_insert(delta as u64);
                    }
                    DbOp::MigrateLegacyHeatmap { state, reply } => {
                        let res = migrate_legacy_heatmap(&mut conn, &state);
                        let _ = reply.send(res);
                    }
                    DbOp::ClearHeatmap {
                        display_id,
                        date_key,
                        reply,
                    } => {
                        let res = (|| -> Result<(), String> {
                            let tx = conn
                                .transaction()
                                .map_err(|e| format!("Failed to start sqlite transaction: {}", e))?;

                            match (display_id.as_deref(), date_key.as_deref()) {
                                (Some(display_id), Some(date_key)) => {
                                    tx.execute(
                                        "DELETE FROM click_heatmap_daily_cells WHERE date_key=?1 AND display_id=?2",
                                        params![date_key, display_id],
                                    )
                                    .map_err(|e| format!("Failed to clear click_heatmap_daily_cells: {}", e))?;
                                    tx.execute(
                                        "DELETE FROM click_heatmap_daily_meta WHERE date_key=?1 AND display_id=?2",
                                        params![date_key, display_id],
                                    )
                                    .map_err(|e| format!("Failed to clear click_heatmap_daily_meta: {}", e))?;
                                }
                                (None, Some(date_key)) => {
                                    tx.execute(
                                        "DELETE FROM click_heatmap_daily_cells WHERE date_key=?1",
                                        params![date_key],
                                    )
                                    .map_err(|e| format!("Failed to clear click_heatmap_daily_cells: {}", e))?;
                                    tx.execute(
                                        "DELETE FROM click_heatmap_daily_meta WHERE date_key=?1",
                                        params![date_key],
                                    )
                                    .map_err(|e| format!("Failed to clear click_heatmap_daily_meta: {}", e))?;
                                }
                                (Some(display_id), None) => {
                                    tx.execute(
                                        "DELETE FROM click_heatmap_total_cells WHERE display_id=?1",
                                        params![display_id],
                                    )
                                    .map_err(|e| format!("Failed to clear click_heatmap_total_cells: {}", e))?;
                                    tx.execute(
                                        "DELETE FROM click_heatmap_total_meta WHERE display_id=?1",
                                        params![display_id],
                                    )
                                    .map_err(|e| format!("Failed to clear click_heatmap_total_meta: {}", e))?;
                                }
                                (None, None) => {
                                    tx.execute("DELETE FROM click_heatmap_total_cells", [])
                                        .map_err(|e| format!("Failed to clear click_heatmap_total_cells: {}", e))?;
                                    tx.execute("DELETE FROM click_heatmap_total_meta", [])
                                        .map_err(|e| format!("Failed to clear click_heatmap_total_meta: {}", e))?;
                                    tx.execute("DELETE FROM click_heatmap_daily_cells", [])
                                        .map_err(|e| format!("Failed to clear click_heatmap_daily_cells: {}", e))?;
                                    tx.execute("DELETE FROM click_heatmap_daily_meta", [])
                                        .map_err(|e| format!("Failed to clear click_heatmap_daily_meta: {}", e))?;
                                }
                            }

                            tx.commit()
                                .map_err(|e| format!("Failed to commit click heatmap clear: {}", e))?;
                            Ok(())
                        })();
                        let _ = reply.send(res);
                    }
                    DbOp::Vacuum => {
                        let _ = conn.execute("VACUUM", []);
                    }
                }
            }

            let should_flush = !pending_total_cells.is_empty()
                && (now_ms().saturating_sub(last_flush_ms) >= 650
                    || pending_total_cells.len() + pending_daily_cells.len() >= 1200);
            if should_flush {
                let total_cells = std::mem::take(&mut pending_total_cells);
                let daily_cells = std::mem::take(&mut pending_daily_cells);
                let total_clicks = std::mem::take(&mut pending_total_clicks);
                let daily_clicks = std::mem::take(&mut pending_daily_clicks);
                if let Err(e) = apply_heatmap_batch(&mut conn, total_cells, daily_cells, total_clicks, daily_clicks) {
                    eprintln!("{}", e);
                }
                last_flush_ms = now_ms();
            }
        }
    });

    *CTX.lock() = Some(DbContext { path, tx });
    Ok(())
}

fn with_ctx<T>(f: impl FnOnce(&DbContext) -> T) -> Option<T> {
    CTX.lock().as_ref().map(f)
}

pub fn enqueue_bulk_upsert_daily(days: Vec<DailyStats>) {
    if days.is_empty() {
        return;
    }
    let _ = with_ctx(|ctx| ctx.tx.send(DbOp::BulkUpsertDaily(days)));
}

pub fn clear_daily_stats() {
    let _ = with_ctx(|ctx| ctx.tx.send(DbOp::ClearDaily));
    let _ = with_ctx(|ctx| ctx.tx.send(DbOp::Vacuum));
}

pub fn record_click_heatmap_cell(display_id: &str, idx: usize) -> bool {
    let trimmed = display_id.trim();
    if trimmed.is_empty() {
        return false;
    }
    let idx = u32::try_from(idx).unwrap_or(u32::MAX);
    let date_key = chrono::Local::now().date_naive().to_string();

    with_ctx(|ctx| {
        ctx.tx.send(DbOp::HeatmapDelta {
            date_key,
            display_id: trimmed.to_string(),
            idx,
            delta: 1,
        })
    })
    .and_then(|res| res.ok())
    .is_some()
}

pub fn enqueue_migrate_click_heatmap_legacy(
    state: ClickHeatmapState,
) -> Result<mpsc::Receiver<Result<(), String>>, String> {
    let ctx = CTX
        .lock()
        .clone()
        .ok_or_else(|| "history db not initialized".to_string())?;

    let (reply_tx, reply_rx) = mpsc::channel::<Result<(), String>>();
    ctx.tx
        .send(DbOp::MigrateLegacyHeatmap { state, reply: reply_tx })
        .map_err(|_| "history db worker not available".to_string())?;

    Ok(reply_rx)
}

pub fn clear_click_heatmap(display_id: Option<String>, date_key: Option<String>) -> Result<(), String> {
    let ctx = CTX
        .lock()
        .clone()
        .ok_or_else(|| "history db not initialized".to_string())?;

    let (reply_tx, reply_rx) = mpsc::channel::<Result<(), String>>();
    ctx.tx
        .send(DbOp::ClearHeatmap {
            display_id,
            date_key,
            reply: reply_tx,
        })
        .map_err(|_| "history db worker not available".to_string())?;

    reply_rx
        .recv()
        .map_err(|_| "history db clear failed: worker disconnected".to_string())?
}

pub fn load_recent_days(limit: usize) -> Result<Vec<DailyStats>, String> {
    let ctx = CTX
        .lock()
        .clone()
        .ok_or_else(|| "history db not initialized".to_string())?;

    let conn = open_read_conn(&ctx.path)?;
    let mut stmt = conn
        .prepare(
            r#"
SELECT date_key, payload_json
FROM daily_stats
ORDER BY date_key DESC
LIMIT ?1
"#,
        )
        .map_err(|e| format!("Failed to prepare daily_stats query: {}", e))?;

    let rows = stmt
        .query_map([limit as i64], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| format!("Failed to query daily_stats: {}", e))?;

    let mut out: Vec<(String, DailyStats)> = Vec::new();
    for row in rows {
        let (date_key, json) = row.map_err(|e| format!("Failed to read daily_stats row: {}", e))?;
        let day = serde_json::from_str::<DailyStats>(&json)
            .map_err(|e| format!("Failed to parse daily_stats json: {}", e))?;
        out.push((date_key, day));
    }

    if out.is_empty() {
        return Ok(Vec::new());
    }

    let mut min_key = out[0].0.clone();
    let mut max_key = out[0].0.clone();
    for (k, _) in &out {
        if *k < min_key {
            min_key = k.clone();
        }
        if *k > max_key {
            max_key = k.clone();
        }
    }

    let mut key_counts_all: HashMap<String, HashMap<String, u64>> = HashMap::new();
    let mut key_counts_unshifted: HashMap<String, HashMap<String, u64>> = HashMap::new();
    let mut key_counts_shifted: HashMap<String, HashMap<String, u64>> = HashMap::new();

    {
        let mut stmt = conn
            .prepare(
                "SELECT date_key, kind, code, count FROM daily_key_counts WHERE date_key BETWEEN ?1 AND ?2",
            )
            .map_err(|e| format!("Failed to prepare daily_key_counts hydration query: {}", e))?;
        let rows = stmt
            .query_map(params![min_key, max_key], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            })
            .map_err(|e| format!("Failed to hydrate daily_key_counts: {}", e))?;
        for row in rows {
            let (date_key, kind, code, count) =
                row.map_err(|e| format!("Failed to read daily_key_counts row: {}", e))?;
            let count_u64 = u64::try_from(count).unwrap_or(u64::MAX);
            if count_u64 == 0 {
                continue;
            }
            let target = match kind {
                0 => &mut key_counts_all,
                1 => &mut key_counts_unshifted,
                2 => &mut key_counts_shifted,
                _ => continue,
            };
            target
                .entry(date_key)
                .or_default()
                .insert(code, count_u64);
        }
    }

    let mut shortcut_counts: HashMap<String, HashMap<String, u64>> = HashMap::new();
    {
        let mut stmt = conn
            .prepare("SELECT date_key, shortcut, count FROM daily_shortcut_counts WHERE date_key BETWEEN ?1 AND ?2")
            .map_err(|e| format!("Failed to prepare daily_shortcut_counts hydration query: {}", e))?;
        let rows = stmt
            .query_map(params![min_key, max_key], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            })
            .map_err(|e| format!("Failed to hydrate daily_shortcut_counts: {}", e))?;
        for row in rows {
            let (date_key, shortcut, count) =
                row.map_err(|e| format!("Failed to read daily_shortcut_counts row: {}", e))?;
            let count_u64 = u64::try_from(count).unwrap_or(u64::MAX);
            if count_u64 == 0 {
                continue;
            }
            shortcut_counts
                .entry(date_key)
                .or_default()
                .insert(shortcut, count_u64);
        }
    }

    let mut mouse_button_counts: HashMap<String, HashMap<String, u64>> = HashMap::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT date_key, button, count FROM daily_mouse_button_counts WHERE date_key BETWEEN ?1 AND ?2",
            )
            .map_err(|e| format!("Failed to prepare daily_mouse_button_counts hydration query: {}", e))?;
        let rows = stmt
            .query_map(params![min_key, max_key], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            })
            .map_err(|e| format!("Failed to hydrate daily_mouse_button_counts: {}", e))?;
        for row in rows {
            let (date_key, button, count) =
                row.map_err(|e| format!("Failed to read daily_mouse_button_counts row: {}", e))?;
            let count_u64 = u64::try_from(count).unwrap_or(u64::MAX);
            if count_u64 == 0 {
                continue;
            }
            mouse_button_counts
                .entry(date_key)
                .or_default()
                .insert(button, count_u64);
        }
    }

    let mut hourly: HashMap<String, Vec<crate::models::merit::HourlyStats>> = HashMap::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT date_key, hour, total, keyboard, mouse_single FROM daily_hourly WHERE date_key BETWEEN ?1 AND ?2",
            )
            .map_err(|e| format!("Failed to prepare daily_hourly hydration query: {}", e))?;
        let rows = stmt
            .query_map(params![min_key, max_key], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                ))
            })
            .map_err(|e| format!("Failed to hydrate daily_hourly: {}", e))?;
        for row in rows {
            let (date_key, hour, total, keyboard, mouse_single) =
                row.map_err(|e| format!("Failed to read daily_hourly row: {}", e))?;
            let hour_usize = usize::try_from(hour).unwrap_or(0);
            if hour_usize >= 24 {
                continue;
            }
            let entry = hourly
                .entry(date_key)
                .or_insert_with(|| vec![crate::models::merit::HourlyStats::default(); 24]);
            let b = &mut entry[hour_usize];
            b.total = u64::try_from(total).unwrap_or(u64::MAX);
            b.keyboard = u64::try_from(keyboard).unwrap_or(u64::MAX);
            b.mouse_single = u64::try_from(mouse_single).unwrap_or(u64::MAX);
        }
    }

    let mut app_input_counts: HashMap<String, HashMap<String, crate::models::merit::AppInputStats>> =
        HashMap::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT date_key, app_id, name, keyboard, mouse_single FROM daily_app_input WHERE date_key BETWEEN ?1 AND ?2",
            )
            .map_err(|e| format!("Failed to prepare daily_app_input hydration query: {}", e))?;
        let rows = stmt
            .query_map(params![min_key, max_key], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                ))
            })
            .map_err(|e| format!("Failed to hydrate daily_app_input: {}", e))?;
        for row in rows {
            let (date_key, app_id, name, keyboard, mouse_single) =
                row.map_err(|e| format!("Failed to read daily_app_input row: {}", e))?;
            let keyboard_u64 = u64::try_from(keyboard).unwrap_or(u64::MAX);
            let mouse_u64 = u64::try_from(mouse_single).unwrap_or(u64::MAX);
            if keyboard_u64 == 0 && mouse_u64 == 0 {
                continue;
            }
            app_input_counts
                .entry(date_key)
                .or_default()
                .insert(
                    app_id,
                    crate::models::merit::AppInputStats {
                        name,
                        total: keyboard_u64.saturating_add(mouse_u64),
                        keyboard: keyboard_u64,
                        mouse_single: mouse_u64,
                    },
                );
        }
    }

    let mut days: Vec<DailyStats> = Vec::with_capacity(out.len());
    for (date_key, mut day) in out {
        if let Some(m) = key_counts_all.get(&date_key) {
            day.key_counts = m.clone();
        }
        if let Some(m) = key_counts_unshifted.get(&date_key) {
            day.key_counts_unshifted = m.clone();
        }
        if let Some(m) = key_counts_shifted.get(&date_key) {
            day.key_counts_shifted = m.clone();
        }
        if let Some(m) = shortcut_counts.get(&date_key) {
            day.shortcut_counts = m.clone();
        }
        if let Some(m) = mouse_button_counts.get(&date_key) {
            day.mouse_button_counts = m.clone();
        }
        if let Some(v) = hourly.get(&date_key) {
            day.hourly = v.clone();
        } else if day.hourly.is_empty() {
            day.hourly = vec![crate::models::merit::HourlyStats::default(); 24];
        }
        if let Some(m) = app_input_counts.get(&date_key) {
            day.app_input_counts = m.clone();
        }
        days.push(day);
    }

    Ok(days)
}

pub fn load_recent_days_lite(limit: usize) -> Result<Vec<crate::models::DailyStatsLite>, String> {
    let ctx = CTX
        .lock()
        .clone()
        .ok_or_else(|| "history db not initialized".to_string())?;

    let conn = open_read_conn(&ctx.path)?;
    let mut stmt = conn
        .prepare(
            r#"
SELECT payload_json
FROM daily_stats
ORDER BY date_key DESC
LIMIT ?1
"#,
        )
        .map_err(|e| format!("Failed to prepare daily_stats lite query: {}", e))?;

    let rows = stmt
        .query_map([limit as i64], |row| row.get::<_, String>(0))
        .map_err(|e| format!("Failed to query daily_stats lite: {}", e))?;

    let mut out = Vec::new();
    for row in rows {
        let json = row.map_err(|e| format!("Failed to read daily_stats lite row: {}", e))?;
        let day = serde_json::from_str::<crate::models::DailyStatsLite>(&json)
            .map_err(|e| format!("Failed to parse daily_stats lite json: {}", e))?;
        out.push(day);
    }
    Ok(out)
}

fn load_aggregate_key_counts(
    conn: &Connection,
    kind: i64,
    start_key: Option<&str>,
    end_key: Option<&str>,
) -> Result<HashMap<String, u64>, String> {
    fn map_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<(String, i64)> {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    }

    let mut stmt = conn
        .prepare(match (start_key, end_key) {
            (Some(_), Some(_)) => "SELECT code, SUM(count) FROM daily_key_counts WHERE kind=?1 AND date_key BETWEEN ?2 AND ?3 GROUP BY code",
            (Some(_), None) => "SELECT code, SUM(count) FROM daily_key_counts WHERE kind=?1 AND date_key >= ?2 GROUP BY code",
            (None, Some(_)) => "SELECT code, SUM(count) FROM daily_key_counts WHERE kind=?1 AND date_key <= ?2 GROUP BY code",
            (None, None) => "SELECT code, SUM(count) FROM daily_key_counts WHERE kind=?1 GROUP BY code",
        })
        .map_err(|e| format!("Failed to prepare key aggregate query: {}", e))?;

    let rows = match (start_key, end_key) {
        (Some(a), Some(b)) => stmt
            .query_map(params![kind, a, b], map_row)
            .map_err(|e| format!("Failed to query key aggregate: {}", e))?,
        (Some(a), None) => stmt
            .query_map(params![kind, a], map_row)
            .map_err(|e| format!("Failed to query key aggregate: {}", e))?,
        (None, Some(b)) => stmt
            .query_map(params![kind, b], map_row)
            .map_err(|e| format!("Failed to query key aggregate: {}", e))?,
        (None, None) => stmt
            .query_map(params![kind], map_row)
            .map_err(|e| format!("Failed to query key aggregate: {}", e))?,
    };

    let mut out = HashMap::new();
    for row in rows {
        let (code, count) = row.map_err(|e| format!("Failed to read key aggregate row: {}", e))?;
        let count_u64 = u64::try_from(count).unwrap_or(u64::MAX);
        if count_u64 == 0 {
            continue;
        }
        out.insert(code, count_u64);
    }
    Ok(out)
}

fn load_aggregate_simple_counts(
    conn: &Connection,
    table: &str,
    key_column: &str,
    start_key: Option<&str>,
    end_key: Option<&str>,
) -> Result<HashMap<String, u64>, String> {
    fn map_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<(String, i64)> {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    }

    let sql = match (start_key, end_key) {
        (Some(_), Some(_)) => format!(
            "SELECT {key_column}, SUM(count) FROM {table} WHERE date_key BETWEEN ?1 AND ?2 GROUP BY {key_column}"
        ),
        (Some(_), None) => format!(
            "SELECT {key_column}, SUM(count) FROM {table} WHERE date_key >= ?1 GROUP BY {key_column}"
        ),
        (None, Some(_)) => format!(
            "SELECT {key_column}, SUM(count) FROM {table} WHERE date_key <= ?1 GROUP BY {key_column}"
        ),
        (None, None) => format!("SELECT {key_column}, SUM(count) FROM {table} GROUP BY {key_column}"),
    };

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Failed to prepare aggregate query for {}: {}", table, e))?;

    let rows = match (start_key, end_key) {
        (Some(a), Some(b)) => stmt
            .query_map(params![a, b], map_row)
            .map_err(|e| format!("Failed to query aggregate for {}: {}", table, e))?,
        (Some(a), None) | (None, Some(a)) => stmt
            .query_map(params![a], map_row)
            .map_err(|e| format!("Failed to query aggregate for {}: {}", table, e))?,
        (None, None) => stmt
            .query_map([], map_row)
            .map_err(|e| format!("Failed to query aggregate for {}: {}", table, e))?,
    };

    let mut out = HashMap::new();
    for row in rows {
        let (k, count) = row.map_err(|e| format!("Failed to read aggregate row for {}: {}", table, e))?;
        let count_u64 = u64::try_from(count).unwrap_or(u64::MAX);
        if count_u64 == 0 {
            continue;
        }
        out.insert(k, count_u64);
    }
    Ok(out)
}

fn load_aggregate_hourly(
    conn: &Connection,
    start_key: Option<&str>,
    end_key: Option<&str>,
) -> Result<Vec<crate::models::merit::HourlyStats>, String> {
    fn map_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<(i64, i64, i64, i64)> {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, i64>(2)?,
            row.get::<_, i64>(3)?,
        ))
    }

    let mut out = vec![crate::models::merit::HourlyStats::default(); 24];
    let mut stmt = conn
        .prepare(match (start_key, end_key) {
            (Some(_), Some(_)) => "SELECT hour, SUM(total), SUM(keyboard), SUM(mouse_single) FROM daily_hourly WHERE date_key BETWEEN ?1 AND ?2 GROUP BY hour ORDER BY hour",
            (Some(_), None) => "SELECT hour, SUM(total), SUM(keyboard), SUM(mouse_single) FROM daily_hourly WHERE date_key >= ?1 GROUP BY hour ORDER BY hour",
            (None, Some(_)) => "SELECT hour, SUM(total), SUM(keyboard), SUM(mouse_single) FROM daily_hourly WHERE date_key <= ?1 GROUP BY hour ORDER BY hour",
            (None, None) => "SELECT hour, SUM(total), SUM(keyboard), SUM(mouse_single) FROM daily_hourly GROUP BY hour ORDER BY hour",
        })
        .map_err(|e| format!("Failed to prepare hourly aggregate query: {}", e))?;
    let rows = match (start_key, end_key) {
        (Some(a), Some(b)) => stmt
            .query_map(params![a, b], map_row)
            .map_err(|e| format!("Failed to query hourly aggregate: {}", e))?,
        (Some(a), None) | (None, Some(a)) => stmt
            .query_map(params![a], map_row)
            .map_err(|e| format!("Failed to query hourly aggregate: {}", e))?,
        (None, None) => stmt
            .query_map([], map_row)
            .map_err(|e| format!("Failed to query hourly aggregate: {}", e))?,
    };

    for row in rows {
        let (hour, total, keyboard, mouse_single) =
            row.map_err(|e| format!("Failed to read hourly aggregate row: {}", e))?;
        let idx = usize::try_from(hour).unwrap_or(0);
        if idx >= 24 {
            continue;
        }
        out[idx] = crate::models::merit::HourlyStats {
            total: u64::try_from(total).unwrap_or(u64::MAX),
            keyboard: u64::try_from(keyboard).unwrap_or(u64::MAX),
            mouse_single: u64::try_from(mouse_single).unwrap_or(u64::MAX),
        };
    }

    Ok(out)
}

fn load_aggregate_app_input(
    conn: &Connection,
    start_key: Option<&str>,
    end_key: Option<&str>,
) -> Result<HashMap<String, crate::models::merit::AppInputStats>, String> {
    fn map_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<(String, Option<String>, i64, i64)> {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, Option<String>>(1)?,
            row.get::<_, i64>(2)?,
            row.get::<_, i64>(3)?,
        ))
    }

    let mut stmt = conn
        .prepare(match (start_key, end_key) {
            (Some(_), Some(_)) => r#"
SELECT a.app_id, COALESCE(MAX(a.name), m.last_name) AS name, SUM(a.keyboard), SUM(a.mouse_single)
FROM daily_app_input a
LEFT JOIN app_meta m ON m.app_id = a.app_id
WHERE a.date_key BETWEEN ?1 AND ?2
GROUP BY a.app_id
"#,
            (Some(_), None) => r#"
SELECT a.app_id, COALESCE(MAX(a.name), m.last_name) AS name, SUM(a.keyboard), SUM(a.mouse_single)
FROM daily_app_input a
LEFT JOIN app_meta m ON m.app_id = a.app_id
WHERE a.date_key >= ?1
GROUP BY a.app_id
"#,
            (None, Some(_)) => r#"
SELECT a.app_id, COALESCE(MAX(a.name), m.last_name) AS name, SUM(a.keyboard), SUM(a.mouse_single)
FROM daily_app_input a
LEFT JOIN app_meta m ON m.app_id = a.app_id
WHERE a.date_key <= ?1
GROUP BY a.app_id
"#,
            (None, None) => r#"
SELECT a.app_id, COALESCE(MAX(a.name), m.last_name) AS name, SUM(a.keyboard), SUM(a.mouse_single)
FROM daily_app_input a
LEFT JOIN app_meta m ON m.app_id = a.app_id
GROUP BY a.app_id
"#,
        })
        .map_err(|e| format!("Failed to prepare app input aggregate query: {}", e))?;

    let rows = match (start_key, end_key) {
        (Some(a), Some(b)) => stmt
            .query_map(params![a, b], map_row)
            .map_err(|e| format!("Failed to query app input aggregate: {}", e))?,
        (Some(a), None) | (None, Some(a)) => stmt
            .query_map(params![a], map_row)
            .map_err(|e| format!("Failed to query app input aggregate: {}", e))?,
        (None, None) => stmt
            .query_map([], map_row)
            .map_err(|e| format!("Failed to query app input aggregate: {}", e))?,
    };

    let mut out: HashMap<String, crate::models::merit::AppInputStats> = HashMap::new();
    for row in rows {
        let (app_id, name, keyboard, mouse_single) =
            row.map_err(|e| format!("Failed to read app input aggregate row: {}", e))?;
        let keyboard_u64 = u64::try_from(keyboard).unwrap_or(u64::MAX);
        let mouse_u64 = u64::try_from(mouse_single).unwrap_or(u64::MAX);
        if keyboard_u64 == 0 && mouse_u64 == 0 {
            continue;
        }
        out.insert(
            app_id,
            crate::models::merit::AppInputStats {
                name,
                total: keyboard_u64.saturating_add(mouse_u64),
                keyboard: keyboard_u64,
                mouse_single: mouse_u64,
            },
        );
    }
    Ok(out)
}

pub fn load_statistics_aggregates(
    start_key: Option<&str>,
    end_key: Option<&str>,
) -> Result<crate::models::StatisticsAggregates, String> {
    let ctx = CTX
        .lock()
        .clone()
        .ok_or_else(|| "history db not initialized".to_string())?;

    let conn = open_read_conn(&ctx.path)?;
    Ok(crate::models::StatisticsAggregates {
        key_counts_all: load_aggregate_key_counts(&conn, 0, start_key, end_key)?,
        key_counts_unshifted: load_aggregate_key_counts(&conn, 1, start_key, end_key)?,
        key_counts_shifted: load_aggregate_key_counts(&conn, 2, start_key, end_key)?,
        shortcut_counts: load_aggregate_simple_counts(
            &conn,
            "daily_shortcut_counts",
            "shortcut",
            start_key,
            end_key,
        )?,
        mouse_button_counts: load_aggregate_simple_counts(
            &conn,
            "daily_mouse_button_counts",
            "button",
            start_key,
            end_key,
        )?,
        hourly: load_aggregate_hourly(&conn, start_key, end_key)?,
        app_input_counts: load_aggregate_app_input(&conn, start_key, end_key)?,
    })
}

pub fn load_click_heatmap_base(
    display_id: &str,
    date_key: Option<&str>,
) -> Result<(Vec<(u32, u32)>, u64), String> {
    let ctx = CTX
        .lock()
        .clone()
        .ok_or_else(|| "history db not initialized".to_string())?;

    let display_id = display_id.trim();
    if display_id.is_empty() {
        return Ok((Vec::new(), 0));
    }

    let conn = open_read_conn(&ctx.path)?;

    let total_clicks: u64 = match date_key {
        Some(date_key) => conn
            .query_row(
                "SELECT total_clicks FROM click_heatmap_daily_meta WHERE date_key=?1 AND display_id=?2",
                params![date_key, display_id],
                |row| row.get::<_, i64>(0),
            )
            .ok()
            .and_then(|v| u64::try_from(v).ok())
            .unwrap_or(0),
        None => conn
            .query_row(
                "SELECT total_clicks FROM click_heatmap_total_meta WHERE display_id=?1",
                params![display_id],
                |row| row.get::<_, i64>(0),
            )
            .ok()
            .and_then(|v| u64::try_from(v).ok())
            .unwrap_or(0),
    };

    let mut out: Vec<(u32, u32)> = Vec::new();
    match date_key {
        Some(date_key) => {
            let mut stmt = conn
                .prepare(
                    "SELECT idx, count FROM click_heatmap_daily_cells WHERE date_key=?1 AND display_id=?2",
                )
                .map_err(|e| format!("Failed to prepare click_heatmap_daily_cells query: {}", e))?;
            let rows = stmt
                .query_map(params![date_key, display_id], |row| {
                    let idx: i64 = row.get(0)?;
                    let count: i64 = row.get(1)?;
                    Ok((idx, count))
                })
                .map_err(|e| format!("Failed to query click_heatmap_daily_cells: {}", e))?;
            for row in rows {
                let (idx, count) = row.map_err(|e| format!("Failed to read heatmap row: {}", e))?;
                let idx = u32::try_from(idx).unwrap_or(0);
                let count_u32 = u32::try_from(count).unwrap_or(u32::MAX);
                if count_u32 == 0 {
                    continue;
                }
                out.push((idx, count_u32));
            }
        }
        None => {
            let mut stmt = conn
                .prepare("SELECT idx, count FROM click_heatmap_total_cells WHERE display_id=?1")
                .map_err(|e| format!("Failed to prepare click_heatmap_total_cells query: {}", e))?;
            let rows = stmt
                .query_map(params![display_id], |row| {
                    let idx: i64 = row.get(0)?;
                    let count: i64 = row.get(1)?;
                    Ok((idx, count))
                })
                .map_err(|e| format!("Failed to query click_heatmap_total_cells: {}", e))?;
            for row in rows {
                let (idx, count) = row.map_err(|e| format!("Failed to read heatmap row: {}", e))?;
                let idx = u32::try_from(idx).unwrap_or(0);
                let count_u32 = u32::try_from(count).unwrap_or(u32::MAX);
                if count_u32 == 0 {
                    continue;
                }
                out.push((idx, count_u32));
            }
        }
    }

    Ok((out, total_clicks))
}
