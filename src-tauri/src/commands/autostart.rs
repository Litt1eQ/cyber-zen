use tauri::AppHandle;

#[cfg(target_os = "macos")]
fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('\"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(target_os = "macos")]
fn launch_agent_label(app_handle: &AppHandle) -> String {
    format!("{}.autostart", app_handle.config().identifier)
}

#[cfg(target_os = "macos")]
fn launch_agent_plist_path(app_handle: &AppHandle) -> Result<std::path::PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "Failed to resolve HOME".to_string())?;
    let label = launch_agent_label(app_handle);
    Ok(std::path::PathBuf::from(home)
        .join("Library")
        .join("LaunchAgents")
        .join(format!("{}.plist", label)))
}

#[cfg(target_os = "macos")]
fn find_app_bundle_path(current_exe: &std::path::Path) -> Option<std::path::PathBuf> {
    for ancestor in current_exe.ancestors() {
        if let Some(name) = ancestor.file_name().and_then(|s| s.to_str()) {
            if name.ends_with(".app") {
                return Some(ancestor.to_path_buf());
            }
        }
    }
    None
}

#[cfg(target_os = "macos")]
fn plist_contents(app_handle: &AppHandle) -> Result<String, String> {
    let label = launch_agent_label(app_handle);
    let current_exe = std::env::current_exe().map_err(|e| format!("Failed to resolve current_exe: {}", e))?;

    let program_arguments = if let Some(app_bundle) = find_app_bundle_path(&current_exe) {
        vec![
            "/usr/bin/open".to_string(),
            "-a".to_string(),
            app_bundle.to_string_lossy().to_string(),
        ]
    } else {
        vec![current_exe.to_string_lossy().to_string()]
    };

    let args_xml = program_arguments
        .into_iter()
        .map(|arg| format!("    <string>{}</string>", xml_escape(&arg)))
        .collect::<Vec<_>>()
        .join("\n");

    Ok(format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>{label}</string>
  <key>ProgramArguments</key>
  <array>
{args_xml}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
</dict>
</plist>
"#,
        label = xml_escape(&label),
        args_xml = args_xml
    ))
}

#[tauri::command]
pub async fn autostart_is_enabled(app_handle: AppHandle) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        let path = launch_agent_plist_path(&app_handle)?;
        return Ok(path.exists());
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app_handle;
        Ok(false)
    }
}

#[tauri::command]
pub async fn autostart_enable(app_handle: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let path = launch_agent_plist_path(&app_handle)?;
        let contents = plist_contents(&app_handle)?;

        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create LaunchAgents directory: {}", e))?;
        }

        std::fs::write(&path, contents).map_err(|e| format!("Failed to write plist: {}", e))?;
        return Ok(());
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app_handle;
        Err("Autostart is only supported on macOS.".to_string())
    }
}

#[tauri::command]
pub async fn autostart_disable(app_handle: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let path = launch_agent_plist_path(&app_handle)?;
        if path.exists() {
            std::fs::remove_file(&path).map_err(|e| format!("Failed to remove plist: {}", e))?;
        }
        return Ok(());
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app_handle;
        Err("Autostart is only supported on macOS.".to_string())
    }
}
