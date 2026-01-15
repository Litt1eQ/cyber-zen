use once_cell::sync::Lazy;
use parking_lot::RwLock;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::AppHandle;

#[derive(Debug, Clone)]
pub struct AppContext {
    pub id: Arc<str>,
    pub name: Option<Arc<str>>,
}

impl AppContext {
    pub fn unknown() -> Self {
        static UNKNOWN: Lazy<AppContext> = Lazy::new(|| AppContext {
            id: Arc::from("__unknown__"),
            name: None,
        });
        UNKNOWN.clone()
    }

    pub fn for_self(app_handle: &AppHandle) -> Self {
        Self {
            id: Arc::from(app_handle.config().identifier.clone()),
            name: Some(Arc::from(app_handle.package_info().name.clone())),
        }
    }
}

static CURRENT: Lazy<RwLock<Option<AppContext>>> = Lazy::new(|| RwLock::new(None));
static LAST_REFRESH_MS: AtomicU64 = AtomicU64::new(0);

const REFRESH_INTERVAL_MS: u64 = 400;

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn current_or_unknown() -> AppContext {
    current().unwrap_or_else(AppContext::unknown)
}

pub fn current() -> Option<AppContext> {
    let now = now_ms();
    let last = LAST_REFRESH_MS.load(Ordering::Relaxed);
    if now.saturating_sub(last) >= REFRESH_INTERVAL_MS {
        if LAST_REFRESH_MS
            .compare_exchange(last, now, Ordering::SeqCst, Ordering::Relaxed)
            .is_ok()
        {
            let next = imp::query_frontmost_app();
            *CURRENT.write() = next;
        }
    }

    CURRENT.read().clone()
}

#[cfg(target_os = "macos")]
mod imp {
    use super::AppContext;
    use std::sync::Arc;
    use std::ffi::CStr;
    use std::os::raw::{c_char, c_void};

    type Id = *mut c_void;
    type Sel = *mut c_void;
    type Class = *mut c_void;

    #[link(name = "objc")]
    extern "C" {
        fn objc_getClass(name: *const c_char) -> Class;
        fn sel_registerName(name: *const c_char) -> Sel;
        fn objc_msgSend();
    }

    unsafe fn get_class(name: &'static [u8]) -> Class {
        objc_getClass(name.as_ptr() as *const c_char)
    }

    unsafe fn get_sel(name: &'static [u8]) -> Sel {
        sel_registerName(name.as_ptr() as *const c_char)
    }

    unsafe fn msg_send_id(receiver: Id, selector: Sel) -> Id {
        let func: extern "C" fn(Id, Sel) -> Id = std::mem::transmute(objc_msgSend as *const ());
        func(receiver, selector)
    }

    unsafe fn msg_send_void(receiver: Id, selector: Sel) {
        let func: extern "C" fn(Id, Sel) = std::mem::transmute(objc_msgSend as *const ());
        func(receiver, selector);
    }

    unsafe fn msg_send_cstr(receiver: Id, selector: Sel) -> *const c_char {
        let func: extern "C" fn(Id, Sel) -> *const c_char =
            std::mem::transmute(objc_msgSend as *const ());
        func(receiver, selector)
    }

    unsafe fn nsstring_to_string(ns_string: Id) -> Option<String> {
        if ns_string.is_null() {
            return None;
        }
        let utf8 = msg_send_cstr(ns_string, get_sel(b"UTF8String\0"));
        if utf8.is_null() {
            return None;
        }
        Some(
            CStr::from_ptr(utf8)
                .to_string_lossy()
                .trim()
                .to_string(),
        )
    }

    pub(super) fn query_frontmost_app() -> Option<AppContext> {
        unsafe {
            let pool: Id = msg_send_id(get_class(b"NSAutoreleasePool\0") as Id, get_sel(b"new\0"));

            let workspace: Id =
                msg_send_id(get_class(b"NSWorkspace\0") as Id, get_sel(b"sharedWorkspace\0"));
            if workspace.is_null() {
                if !pool.is_null() {
                    msg_send_void(pool, get_sel(b"drain\0"));
                }
                return None;
            }

            let running_app: Id = msg_send_id(workspace, get_sel(b"frontmostApplication\0"));
            if running_app.is_null() {
                if !pool.is_null() {
                    msg_send_void(pool, get_sel(b"drain\0"));
                }
                return None;
            }

            let bundle_id = nsstring_to_string(msg_send_id(running_app, get_sel(b"bundleIdentifier\0")));
            let name = nsstring_to_string(msg_send_id(running_app, get_sel(b"localizedName\0")));

            if !pool.is_null() {
                msg_send_void(pool, get_sel(b"drain\0"));
            }

            let id = bundle_id.or_else(|| name.clone())?;
            Some(AppContext {
                id: Arc::from(id),
                name: name.map(Arc::from),
            })
        }
    }
}

#[cfg(target_os = "windows")]
mod imp {
    use super::AppContext;
    use std::sync::Arc;
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    pub(super) fn query_frontmost_app() -> Option<AppContext> {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd == 0 {
                return None;
            }

            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);
            if pid == 0 {
                return None;
            }

            let handle: HANDLE = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if handle == 0 {
                return None;
            }

            let mut buf = vec![0u16; 2048];
            let mut size: u32 = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(handle, 0, buf.as_mut_ptr(), &mut size);
            let _ = CloseHandle(handle);
            if ok == 0 || size == 0 {
                return None;
            }

            buf.truncate(size as usize);
            let path = OsString::from_wide(&buf).to_string_lossy().to_string();
            let name = std::path::Path::new(&path)
                .file_name()
                .and_then(|s| s.to_str())
                .map(|s| s.to_string());

            Some(AppContext {
                id: Arc::from(path),
                name: name.map(Arc::from),
            })
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod imp {
    use super::AppContext;

    pub(super) fn query_frontmost_app() -> Option<AppContext> {
        None
    }
}
