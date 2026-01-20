use crate::{commands, core::MeritStorage, models::Settings};
use tauri::{
    menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    AppHandle, Manager, Wry,
};

const TRAY_ID: &str = "main";

#[derive(Clone, Copy)]
enum AppLocale {
    En,
    ZhCn,
    ZhTw,
}

fn locale_from_tag(tag: &str) -> AppLocale {
    let normalized = tag.trim().replace('_', "-");
    let lower = normalized.to_lowercase();
    if lower.starts_with("zh") {
        if lower.contains("-tw")
            || lower.contains("-hk")
            || lower.contains("-mo")
            || lower.contains("-hant")
        {
            return AppLocale::ZhTw;
        }
        return AppLocale::ZhCn;
    }
    AppLocale::En
}

fn system_locale() -> AppLocale {
    sys_locale::get_locale()
        .as_deref()
        .map(locale_from_tag)
        .unwrap_or(AppLocale::En)
}

fn effective_locale(settings: &Settings) -> AppLocale {
    match settings.app_locale.as_str() {
        "en" => AppLocale::En,
        "zh-CN" => AppLocale::ZhCn,
        "zh-TW" => AppLocale::ZhTw,
        _ => system_locale(),
    }
}

fn tr(locale: AppLocale, key: &str) -> &'static str {
    match (locale, key) {
        (AppLocale::En, "window_scale") => "Window Scale",
        (AppLocale::ZhCn, "window_scale") => "窗口大小",
        (AppLocale::ZhTw, "window_scale") => "視窗大小",

        (AppLocale::En, "opacity") => "Opacity",
        (AppLocale::ZhCn, "opacity") => "透明度",
        (AppLocale::ZhTw, "opacity") => "透明度",

        (AppLocale::En, "toggle_main.show") => "Show Fish",
        (AppLocale::ZhCn, "toggle_main.show") => "显示木鱼",
        (AppLocale::ZhTw, "toggle_main.show") => "顯示木魚",

        (AppLocale::En, "toggle_main.hide") => "Hide Fish",
        (AppLocale::ZhCn, "toggle_main.hide") => "隐藏木鱼",
        (AppLocale::ZhTw, "toggle_main.hide") => "隱藏木魚",

        (AppLocale::En, "settings") => "Open Settings",
        (AppLocale::ZhCn, "settings") => "打开设置",
        (AppLocale::ZhTw, "settings") => "打開設定",

        (AppLocale::En, "custom_statistics") => "Custom Statistics",
        (AppLocale::ZhCn, "custom_statistics") => "自定义统计",
        (AppLocale::ZhTw, "custom_statistics") => "自訂統計",

        (AppLocale::En, "logs") => "Logs",
        (AppLocale::ZhCn, "logs") => "日志",
        (AppLocale::ZhTw, "logs") => "日誌",

        (AppLocale::En, "lock_window_position") => "Lock Position",
        (AppLocale::ZhCn, "lock_window_position") => "锁定位置",
        (AppLocale::ZhTw, "lock_window_position") => "鎖定位置",

        (AppLocale::En, "auto_fade") => "Auto Fade",
        (AppLocale::ZhCn, "auto_fade") => "自动淡出",
        (AppLocale::ZhTw, "auto_fade") => "自動淡出",

        (AppLocale::En, "dock") => "Dock To",
        (AppLocale::ZhCn, "dock") => "停靠到",
        (AppLocale::ZhTw, "dock") => "停靠到",

        (AppLocale::En, "dock.top_left") => "Top Left",
        (AppLocale::ZhCn, "dock.top_left") => "左上",
        (AppLocale::ZhTw, "dock.top_left") => "左上",

        (AppLocale::En, "dock.top_right") => "Top Right",
        (AppLocale::ZhCn, "dock.top_right") => "右上",
        (AppLocale::ZhTw, "dock.top_right") => "右上",

        (AppLocale::En, "dock.bottom_left") => "Bottom Left",
        (AppLocale::ZhCn, "dock.bottom_left") => "左下",
        (AppLocale::ZhTw, "dock.bottom_left") => "左下",

        (AppLocale::En, "dock.bottom_right") => "Bottom Right",
        (AppLocale::ZhCn, "dock.bottom_right") => "右下",
        (AppLocale::ZhTw, "dock.bottom_right") => "右下",

        (AppLocale::En, "listening") => "Enable Global Listening",
        (AppLocale::ZhCn, "listening") => "开启全局监听",
        (AppLocale::ZhTw, "listening") => "開啟全域監聽",

        (AppLocale::En, "always_on_top") => "Always on Top",
        (AppLocale::ZhCn, "always_on_top") => "总在最前",
        (AppLocale::ZhTw, "always_on_top") => "總在最前",

        (AppLocale::En, "window_pass_through") => "Click-through",
        (AppLocale::ZhCn, "window_pass_through") => "窗口穿透",
        (AppLocale::ZhTw, "window_pass_through") => "視窗穿透",

        (AppLocale::En, "quit") => "Quit",
        (AppLocale::ZhCn, "quit") => "退出",
        (AppLocale::ZhTw, "quit") => "退出",

        _ => "",
    }
}

fn approx_eq(a: f64, b: f64) -> bool {
    (a - b).abs() < 0.000_1
}

fn current_settings() -> Settings {
    let storage = MeritStorage::instance();
    let guard = storage.read();
    guard.get_settings()
}

fn main_window_visible(app: &AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(true)
}

fn build_window_scale_submenu(
    app: &AppHandle<Wry>,
    settings: &Settings,
) -> tauri::Result<tauri::menu::Submenu<Wry>> {
    let scales = [50u32, 75u32, 100u32, 125u32, 150u32];
    let locale = effective_locale(settings);
    let mut builder = SubmenuBuilder::with_id(app, "window_scale", tr(locale, "window_scale"));
    for scale in scales {
        let id = format!("window_scale:{}", scale);
        let item = CheckMenuItemBuilder::with_id(id, format!("{}%", scale))
            .checked(settings.window_scale == scale)
            .build(app)?;
        builder = builder.item(&item);
    }
    builder.build()
}

fn build_opacity_submenu(
    app: &AppHandle<Wry>,
    settings: &Settings,
) -> tauri::Result<tauri::menu::Submenu<Wry>> {
    // Keep this short for tray usage (match common options).
    let options = [
        (30u32, 0.30f64),
        (50, 0.50),
        (75, 0.75),
        (95, 0.95),
        (100, 1.0),
    ];
    let locale = effective_locale(settings);
    let mut builder = SubmenuBuilder::with_id(app, "opacity", tr(locale, "opacity"));
    for (pct, value) in options {
        let id = format!("opacity:{}", pct);
        let item = CheckMenuItemBuilder::with_id(id, format!("{}%", pct))
            .checked(approx_eq(settings.opacity, value))
            .build(app)?;
        builder = builder.item(&item);
    }
    builder.build()
}

fn build_tray_menu(app: &AppHandle<Wry>) -> tauri::Result<tauri::menu::Menu<Wry>> {
    let settings = current_settings();
    let locale = effective_locale(&settings);
    let visible = main_window_visible(app);
    let listening_enabled = crate::core::is_listening_enabled();

    let toggle_main = MenuItemBuilder::with_id(
        "toggle_main",
        if visible {
            tr(locale, "toggle_main.hide")
        } else {
            tr(locale, "toggle_main.show")
        },
    )
    .build(app)?;
    let settings_item = MenuItemBuilder::with_id("settings", tr(locale, "settings")).build(app)?;
    let custom_statistics_item =
        MenuItemBuilder::with_id("custom_statistics", tr(locale, "custom_statistics")).build(app)?;
    let logs_item = MenuItemBuilder::with_id("logs", tr(locale, "logs")).build(app)?;

    let lock_window_position = CheckMenuItemBuilder::with_id(
        "lock_window_position",
        tr(locale, "lock_window_position"),
    )
        .checked(settings.lock_window_position)
        .build(app)?;

    let listening = CheckMenuItemBuilder::with_id("listening", tr(locale, "listening"))
        .checked(listening_enabled)
        .build(app)?;

    let always_on_top = CheckMenuItemBuilder::with_id("always_on_top", tr(locale, "always_on_top"))
        .checked(settings.always_on_top)
        .build(app)?;

    let window_pass_through =
        CheckMenuItemBuilder::with_id("window_pass_through", tr(locale, "window_pass_through"))
        .checked(settings.window_pass_through)
        .build(app)?;

    let auto_fade = CheckMenuItemBuilder::with_id("auto_fade", tr(locale, "auto_fade"))
        .checked(settings.auto_fade_enabled)
        .build(app)?;

    let dock = SubmenuBuilder::with_id(app, "dock", tr(locale, "dock"))
        .item(
            &MenuItemBuilder::with_id("dock:top_left", tr(locale, "dock.top_left")).build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("dock:top_right", tr(locale, "dock.top_right"))
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("dock:bottom_left", tr(locale, "dock.bottom_left"))
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("dock:bottom_right", tr(locale, "dock.bottom_right"))
                .build(app)?,
        )
        .build()?;

    let window_scale = build_window_scale_submenu(app, &settings)?;
    let opacity = build_opacity_submenu(app, &settings)?;

    let quit = MenuItemBuilder::with_id("quit", tr(locale, "quit")).build(app)?;

    MenuBuilder::new(app)
        .item(&toggle_main)
        .item(&settings_item)
        .item(&custom_statistics_item)
        .item(&logs_item)
        .separator()
        .item(&lock_window_position)
        .item(&dock)
        .item(&auto_fade)
        .separator()
        .item(&listening)
        .separator()
        .item(&always_on_top)
        .item(&window_pass_through)
        .item(&window_scale)
        .item(&opacity)
        .separator()
        .item(&quit)
        .build()
}

pub fn refresh_tray_menu(app: &AppHandle<Wry>) -> tauri::Result<()> {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return Ok(());
    };
    let menu = build_tray_menu(app)?;
    tray.set_menu(Some(menu))?;
    Ok(())
}

/// Tray icon itself is created via `tauri.conf.json` (`app.trayIcon`).
/// This function only ensures our menu is attached/updated.
pub fn create_tray(app: &AppHandle<Wry>) -> tauri::Result<()> {
    refresh_tray_menu(app)
}

pub fn handle_menu_event(app: &AppHandle<Wry>, event: tauri::menu::MenuEvent) {
    let id = event.id().as_ref();
    match id {
        "toggle_main" => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let visible = app
                    .get_webview_window("main")
                    .and_then(|w| w.is_visible().ok())
                    .unwrap_or(true);

                let _ = if visible {
                    commands::window::hide_main_window(app.clone()).await
                } else {
                    commands::window::show_main_window(app.clone()).await
                };

                let _ = refresh_tray_menu(&app);
            });
        }
        "settings" => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = commands::window::show_settings_window(app.clone()).await;
                let _ = refresh_tray_menu(&app);
            });
        }
        "custom_statistics" => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = commands::window::show_custom_statistics_window(app.clone()).await;
                let _ = refresh_tray_menu(&app);
            });
        }
        "logs" => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = commands::window::show_logs_window(app.clone()).await;
                let _ = refresh_tray_menu(&app);
            });
        }
        "lock_window_position" => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let mut settings = current_settings();
                settings.lock_window_position = !settings.lock_window_position;
                let _ = commands::settings::update_settings(app.clone(), settings).await;
                let _ = refresh_tray_menu(&app);
            });
        }
        "listening" => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                if crate::core::is_listening_enabled() {
                    let _ = commands::input::stop_input_listening(app.clone()).await;
                } else {
                    let _ = commands::input::start_input_listening(app.clone()).await;
                }
                let _ = refresh_tray_menu(&app);
            });
        }
        "always_on_top" => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let mut settings = current_settings();
                settings.always_on_top = !settings.always_on_top;
                let _ = commands::settings::update_settings(app.clone(), settings).await;
                let _ = refresh_tray_menu(&app);
            });
        }
        "window_pass_through" => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let mut settings = current_settings();
                settings.window_pass_through = !settings.window_pass_through;
                let _ = commands::settings::update_settings(app.clone(), settings).await;
                let _ = refresh_tray_menu(&app);
            });
        }
        "auto_fade" => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let mut settings = current_settings();
                settings.auto_fade_enabled = !settings.auto_fade_enabled;
                let _ = commands::settings::update_settings(app.clone(), settings).await;
                let _ = refresh_tray_menu(&app);
            });
        }
        "quit" => {
            crate::core::window_placement::capture_all_now(app);
            crate::core::persistence::flush_now();
            app.exit(0);
        }
        _ => {
            if let Some(corner) = id.strip_prefix("dock:") {
                let app = app.clone();
                let corner = corner.to_string();
                tauri::async_runtime::spawn(async move {
                    let _ = commands::window::dock_main_window(app.clone(), corner).await;
                    let _ = refresh_tray_menu(&app);
                });
                return;
            }

            if let Some(scale) = id.strip_prefix("window_scale:") {
                if let Ok(scale) = scale.parse::<u32>() {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let mut settings = current_settings();
                        settings.window_scale = scale;
                        let _ = commands::settings::update_settings(app.clone(), settings).await;
                        let _ = refresh_tray_menu(&app);
                    });
                }
                return;
            }

            if let Some(pct) = id.strip_prefix("opacity:") {
                if let Ok(pct) = pct.parse::<u32>() {
                    let next_opacity = (pct as f64 / 100.0).clamp(0.3, 1.0);
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let mut settings = current_settings();
                        settings.opacity = next_opacity;
                        let _ = commands::settings::update_settings(app.clone(), settings).await;
                        let _ = refresh_tray_menu(&app);
                    });
                }
            }
        }
    }
}
