use crate::{commands, core::MeritStorage, models::Settings};
use tauri::{
    menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    AppHandle, Manager, Wry,
};

const TRAY_ID: &str = "main";

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
    let mut builder = SubmenuBuilder::with_id(app, "window_scale", "窗口大小");
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
    let options = [(30u32, 0.30f64), (50, 0.50), (75, 0.75), (95, 0.95), (100, 1.0)];
    let mut builder = SubmenuBuilder::with_id(app, "opacity", "透明度");
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
    let visible = main_window_visible(app);
    let listening_enabled = crate::core::is_listening_enabled();

    let toggle_main = MenuItemBuilder::with_id(
        "toggle_main",
        if visible { "隐藏木鱼" } else { "显示木鱼" },
    )
    .build(app)?;
    let settings_item = MenuItemBuilder::with_id("settings", "打开设置").build(app)?;

    let lock_window_position =
        CheckMenuItemBuilder::with_id("lock_window_position", "锁定位置")
            .checked(settings.lock_window_position)
            .build(app)?;

    let listening = CheckMenuItemBuilder::with_id("listening", "开启全局监听")
        .checked(listening_enabled)
        .build(app)?;

    let always_on_top = CheckMenuItemBuilder::with_id("always_on_top", "总在最前")
        .checked(settings.always_on_top)
        .build(app)?;

    let window_pass_through = CheckMenuItemBuilder::with_id("window_pass_through", "窗口穿透")
        .checked(settings.window_pass_through)
        .build(app)?;

    let auto_fade = CheckMenuItemBuilder::with_id("auto_fade", "自动淡出")
        .checked(settings.auto_fade_enabled)
        .build(app)?;

    let dock = SubmenuBuilder::with_id(app, "dock", "停靠到")
        .item(&MenuItemBuilder::with_id("dock:top_left", "左上").build(app)?)
        .item(&MenuItemBuilder::with_id("dock:top_right", "右上").build(app)?)
        .item(&MenuItemBuilder::with_id("dock:bottom_left", "左下").build(app)?)
        .item(&MenuItemBuilder::with_id("dock:bottom_right", "右下").build(app)?)
        .build()?;

    let window_scale = build_window_scale_submenu(app, &settings)?;
    let opacity = build_opacity_submenu(app, &settings)?;

    let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;

    MenuBuilder::new(app)
        .item(&toggle_main)
        .item(&settings_item)
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
        "quit" => app.exit(0),
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
