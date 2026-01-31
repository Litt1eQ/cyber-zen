use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::AppHandle;
use once_cell::sync::Lazy;
use parking_lot::RwLock;

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

const REFRESH_INTERVAL_MS: u64 = 400;
const FALLBACK_REFRESH_INTERVAL_MS: u64 = 2000;

static SAMPLER_STARTED: AtomicBool = AtomicBool::new(false);
static ACTIVE_APP_CACHE: Lazy<RwLock<AppContext>> = Lazy::new(|| RwLock::new(AppContext::unknown()));

fn set_cached(next: AppContext) {
    *ACTIVE_APP_CACHE.write() = next;
}

pub fn init_sampler() {
    if SAMPLER_STARTED.swap(true, Ordering::Relaxed) {
        return;
    }

    let watcher_started = imp::start_foreground_watcher();

    // Seed cache immediately so early events get a plausible app context.
    let seeded = crate::core::perf::time(crate::core::perf::TimerKind::ActiveAppQuery, || {
        imp::query_frontmost_app()
    })
    .unwrap_or_else(AppContext::unknown);
    set_cached(seeded);

    let poll_interval_ms = if watcher_started {
        FALLBACK_REFRESH_INTERVAL_MS
    } else {
        REFRESH_INTERVAL_MS
    };

    std::thread::Builder::new()
        .name("active_app_fallback_poll".to_string())
        .spawn(move || loop {
            let next = crate::core::perf::time(crate::core::perf::TimerKind::ActiveAppQuery, || {
                imp::query_frontmost_app()
            })
            .unwrap_or_else(AppContext::unknown);
            set_cached(next);
            std::thread::sleep(std::time::Duration::from_millis(poll_interval_ms));
        })
        .expect("spawn active_app_fallback_poll");
}

pub fn current_or_unknown() -> AppContext {
    ACTIVE_APP_CACHE.read().clone()
}

#[cfg(target_os = "macos")]
mod imp {
    use super::AppContext;
    use super::set_cached;
    use std::sync::Arc;
    use std::ffi::CStr;
    use std::os::raw::{c_char, c_void};
    use std::sync::atomic::{AtomicBool, Ordering};

    type Id = *mut c_void;
    type Sel = *mut c_void;
    type Class = *mut c_void;

    #[link(name = "objc")]
    extern "C" {
        fn objc_getClass(name: *const c_char) -> Class;
        fn sel_registerName(name: *const c_char) -> Sel;
        fn objc_msgSend();
        fn objc_allocateClassPair(superclass: Class, name: *const c_char, extra_bytes: usize) -> Class;
        fn objc_registerClassPair(cls: Class);
        fn class_addMethod(cls: Class, name: Sel, imp: *const c_void, types: *const c_char) -> i32;
        fn objc_autoreleasePoolPush() -> *mut c_void;
        fn objc_autoreleasePoolPop(pool: *mut c_void);
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

    unsafe fn msg_send_void_5(receiver: Id, selector: Sel, a: Id, b: Sel, c: Id, d: Id) {
        let func: extern "C" fn(Id, Sel, Id, Sel, Id, Id) =
            std::mem::transmute(objc_msgSend as *const ());
        func(receiver, selector, a, b, c, d);
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

    static WATCHER_STARTED: AtomicBool = AtomicBool::new(false);

    unsafe extern "C" fn on_workspace_activate(_this: Id, _cmd: Sel, _notification: Id) {
        let pool = objc_autoreleasePoolPush();
        let next = crate::core::perf::time(
            crate::core::perf::TimerKind::ActiveAppQuery,
            || query_frontmost_app(),
        )
        .unwrap_or_else(AppContext::unknown);
        set_cached(next);
        objc_autoreleasePoolPop(pool);
    }

    pub(super) fn start_foreground_watcher() -> bool {
        if WATCHER_STARTED.swap(true, Ordering::Relaxed) {
            return true;
        }

        let (ready_tx, ready_rx) = std::sync::mpsc::sync_channel::<bool>(1);

        let spawned = std::thread::Builder::new()
            .name("active_app_watcher".to_string())
            .spawn(move || unsafe {
                let pool = objc_autoreleasePoolPush();
                let ns_object: Class = get_class(b"NSObject\0");
                if ns_object.is_null() {
                    let _ = ready_tx.send(false);
                    objc_autoreleasePoolPop(pool);
                    return;
                }

                let cls_name = b"CZActiveAppObserver\0";
                let mut observer_cls: Class = get_class(cls_name);
                if observer_cls.is_null() {
                    observer_cls = objc_allocateClassPair(ns_object, cls_name.as_ptr() as *const c_char, 0);
                    if !observer_cls.is_null() {
                        let sel = get_sel(b"onWorkspaceActivate:\0");
                        let types = b"v@:@\0";
                        let added = class_addMethod(
                            observer_cls,
                            sel,
                            on_workspace_activate as *const c_void,
                            types.as_ptr() as *const c_char,
                        );
                        if added != 0 {
                            objc_registerClassPair(observer_cls);
                        } else {
                            let _ = ready_tx.send(false);
                            objc_autoreleasePoolPop(pool);
                            return;
                        }
                    } else {
                        let _ = ready_tx.send(false);
                        objc_autoreleasePoolPop(pool);
                        return;
                    }
                }

                let observer: Id = msg_send_id(observer_cls as Id, get_sel(b"new\0"));
                if observer.is_null() {
                    let _ = ready_tx.send(false);
                    objc_autoreleasePoolPop(pool);
                    return;
                }

                let workspace: Id =
                    msg_send_id(get_class(b"NSWorkspace\0") as Id, get_sel(b"sharedWorkspace\0"));
                if workspace.is_null() {
                    let _ = ready_tx.send(false);
                    objc_autoreleasePoolPop(pool);
                    return;
                }

                // Subscribe to activation notifications.
                // Using a string with the same contents as the Foundation constant is sufficient,
                // because notification centers compare names by string equality.
                let name: Id = {
                    let nsstring_cls = get_class(b"NSString\0") as Id;
                    if nsstring_cls.is_null() {
                        let _ = ready_tx.send(false);
                        objc_autoreleasePoolPop(pool);
                        return;
                    }
                    let sel = get_sel(b"stringWithUTF8String:\0");
                    let func: extern "C" fn(Id, Sel, *const c_char) -> Id =
                        std::mem::transmute(objc_msgSend as *const ());
                    func(
                        nsstring_cls,
                        sel,
                        b"NSWorkspaceDidActivateApplicationNotification\0".as_ptr() as *const c_char,
                    )
                };
                if name.is_null() {
                    let _ = ready_tx.send(false);
                    objc_autoreleasePoolPop(pool);
                    return;
                }
                // Keep the notification name alive even if the center doesn't retain/copy it.
                let _ = msg_send_id(name, get_sel(b"retain\0"));

                let nc: Id = msg_send_id(workspace, get_sel(b"notificationCenter\0"));
                if nc.is_null() {
                    let _ = ready_tx.send(false);
                    objc_autoreleasePoolPop(pool);
                    return;
                }

                msg_send_void_5(
                    nc,
                    get_sel(b"addObserver:selector:name:object:\0"),
                    observer,
                    get_sel(b"onWorkspaceActivate:\0"),
                    name,
                    std::ptr::null_mut(),
                );

                objc_autoreleasePoolPop(pool);

                let _ = ready_tx.send(true);

                // Keep this thread alive to receive notifications.
                // `-run` never returns under normal operation.
                let run_loop: Id =
                    msg_send_id(get_class(b"NSRunLoop\0") as Id, get_sel(b"currentRunLoop\0"));
                if !run_loop.is_null() {
                    msg_send_void(run_loop, get_sel(b"run\0"));
                }
            })
            .is_ok();

        if !spawned {
            WATCHER_STARTED.store(false, Ordering::Relaxed);
            return false;
        }

        match ready_rx.recv_timeout(std::time::Duration::from_millis(800)) {
            Ok(true) => true,
            Ok(false) | Err(_) => {
                WATCHER_STARTED.store(false, Ordering::Relaxed);
                false
            }
        }
    }
}

#[cfg(target_os = "windows")]
mod imp {
    use super::AppContext;
    use super::set_cached;
    use std::sync::Arc;
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};
    use windows_sys::Win32::UI::Accessibility::{
        SetWinEventHook, HWINEVENTHOOK, EVENT_SYSTEM_FOREGROUND,
        WINEVENT_OUTOFCONTEXT, WINEVENT_SKIPOWNPROCESS,
    };

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

    static WATCHER_STARTED: AtomicBool = AtomicBool::new(false);
    static LAST_HWND: AtomicUsize = AtomicUsize::new(0);
    static mut HOOK: HWINEVENTHOOK = 0;

    unsafe extern "system" fn on_foreground_change(
        _hook: HWINEVENTHOOK,
        event: u32,
        hwnd: isize,
        _id_object: i32,
        _id_child: i32,
        _event_thread: u32,
        _event_time: u32,
    ) {
        if event != EVENT_SYSTEM_FOREGROUND {
            return;
        }
        let hwnd_usize = hwnd as usize;
        if hwnd_usize == 0 {
            return;
        }
        if LAST_HWND.swap(hwnd_usize, Ordering::Relaxed) == hwnd_usize {
            return;
        }

        let next = crate::core::perf::time(
            crate::core::perf::TimerKind::ActiveAppQuery,
            || query_frontmost_app(),
        )
        .unwrap_or_else(AppContext::unknown);
        set_cached(next);
    }

    pub(super) fn start_foreground_watcher() -> bool {
        if WATCHER_STARTED.swap(true, Ordering::Relaxed) {
            return true;
        }

        // Keep the hook handle alive for the process lifetime. This is a low-footprint system hook,
        // and having it registered avoids periodic polling overhead.
        unsafe {
            let hook = SetWinEventHook(
                EVENT_SYSTEM_FOREGROUND,
                EVENT_SYSTEM_FOREGROUND,
                0,
                Some(on_foreground_change),
                0,
                0,
                WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
            );
            if hook == 0 {
                WATCHER_STARTED.store(false, Ordering::Relaxed);
                return false;
            }
            HOOK = hook;
        }

        true
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod imp {
    use super::AppContext;

    pub(super) fn start_foreground_watcher() -> bool {
        false
    }

    pub(super) fn query_frontmost_app() -> Option<AppContext> {
        None
    }
}
