use tauri::AppHandle;

fn autostart_label(app_handle: &AppHandle) -> String {
    format!("{}.autostart", app_handle.config().identifier)
}

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
fn launch_agent_plist_path(app_handle: &AppHandle) -> Result<std::path::PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "Failed to resolve HOME".to_string())?;
    let label = autostart_label(app_handle);
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
    let label = autostart_label(app_handle);
    let current_exe =
        std::env::current_exe().map_err(|e| format!("Failed to resolve current_exe: {}", e))?;

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

#[cfg(target_os = "linux")]
fn xdg_config_home() -> Result<std::path::PathBuf, String> {
    if let Ok(value) = std::env::var("XDG_CONFIG_HOME") {
        if !value.trim().is_empty() {
            return Ok(std::path::PathBuf::from(value));
        }
    }
    let home = std::env::var("HOME").map_err(|_| "Failed to resolve HOME".to_string())?;
    Ok(std::path::PathBuf::from(home).join(".config"))
}

#[cfg(target_os = "linux")]
fn linux_autostart_desktop_path(app_handle: &AppHandle) -> Result<std::path::PathBuf, String> {
    let label = autostart_label(app_handle);
    Ok(xdg_config_home()?
        .join("autostart")
        .join(format!("{}.desktop", label)))
}

#[cfg(target_os = "linux")]
fn desktop_entry_exec_value() -> Result<String, String> {
    let current_exe =
        std::env::current_exe().map_err(|e| format!("Failed to resolve current_exe: {}", e))?;
    let exe = current_exe.to_string_lossy().replace('"', "\\\"");
    Ok(format!("\"{}\"", exe))
}

#[cfg(target_os = "linux")]
fn desktop_entry_contents(app_handle: &AppHandle) -> Result<String, String> {
    let name = app_handle.package_info().name.clone();
    let exec = desktop_entry_exec_value()?;
    Ok(format!(
        r#"[Desktop Entry]
Type=Application
Name={name}
Exec={exec}
Terminal=false
X-GNOME-Autostart-enabled=true
"#,
        name = name,
        exec = exec
    ))
}

#[cfg(target_os = "windows")]
fn windows_run_key() -> &'static str {
    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run"
}

#[cfg(target_os = "windows")]
fn windows_value_name(app_handle: &AppHandle) -> String {
    autostart_label(app_handle)
}

#[cfg(target_os = "windows")]
fn windows_value_data() -> Result<String, String> {
    let current_exe =
        std::env::current_exe().map_err(|e| format!("Failed to resolve current_exe: {}", e))?;
    let exe = current_exe.to_string_lossy().replace('"', "\\\"");
    Ok(format!("\"{}\"", exe))
}

#[cfg(target_os = "windows")]
fn reg_output(args: &[String]) -> Result<std::process::Output, String> {
    use std::process::Command;

    Command::new("reg")
        .args(args)
        .output()
        .map_err(|e| format!("Failed to run reg.exe: {}", e))
}

#[tauri::command]
pub async fn autostart_is_enabled(app_handle: AppHandle) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        let path = launch_agent_plist_path(&app_handle)?;
        return Ok(path.exists());
    }
    #[cfg(target_os = "linux")]
    {
        let path = linux_autostart_desktop_path(&app_handle)?;
        return Ok(path.exists());
    }
    #[cfg(target_os = "windows")]
    {
        let key = windows_run_key();
        let name = windows_value_name(&app_handle);
        let args = vec!["query".to_string(), key.to_string(), "/v".to_string(), name];
        let output = reg_output(&args)?;
        return Ok(output.status.success());
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
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
    #[cfg(target_os = "linux")]
    {
        let path = linux_autostart_desktop_path(&app_handle)?;
        let contents = desktop_entry_contents(&app_handle)?;

        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create autostart directory: {}", e))?;
        }

        std::fs::write(&path, contents).map_err(|e| format!("Failed to write .desktop: {}", e))?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        let key = windows_run_key();
        let name = windows_value_name(&app_handle);
        let data = windows_value_data()?;
        let args = vec![
            "add".to_string(),
            key.to_string(),
            "/v".to_string(),
            name,
            "/t".to_string(),
            "REG_SZ".to_string(),
            "/d".to_string(),
            data,
            "/f".to_string(),
        ];

        let output = reg_output(&args)?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let detail = if !stderr.is_empty() { stderr } else { stdout };
            return Err(format!("Failed to enable autostart: {}", detail));
        }

        return Ok(());
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        let _ = app_handle;
        Err("Autostart is only supported on macOS, Windows, and Linux.".to_string())
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
    #[cfg(target_os = "linux")]
    {
        let path = linux_autostart_desktop_path(&app_handle)?;
        if path.exists() {
            std::fs::remove_file(&path).map_err(|e| format!("Failed to remove .desktop: {}", e))?;
        }
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        let key = windows_run_key();
        let name = windows_value_name(&app_handle);
        let query_args = vec![
            "query".to_string(),
            key.to_string(),
            "/v".to_string(),
            name.clone(),
        ];
        let query_output = reg_output(&query_args)?;
        if !query_output.status.success() {
            return Ok(());
        }

        let delete_args = vec![
            "delete".to_string(),
            key.to_string(),
            "/v".to_string(),
            name,
            "/f".to_string(),
        ];

        let output = reg_output(&delete_args)?;
        if output.status.success() {
            return Ok(());
        }

        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if !stderr.trim().is_empty() {
            stderr.trim().to_string()
        } else {
            stdout.trim().to_string()
        };
        Err(format!("Failed to disable autostart: {}", detail))
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        let _ = app_handle;
        Err("Autostart is only supported on macOS, Windows, and Linux.".to_string())
    }
}
