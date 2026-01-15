use once_cell::sync::Lazy;
use parking_lot::RwLock;
use std::collections::HashMap;

const MAX_CACHED_ICONS: usize = 256;

static CACHE: Lazy<RwLock<HashMap<String, String>>> = Lazy::new(|| RwLock::new(HashMap::new()));

pub fn get_app_icon_png_base64(app_id: &str) -> Option<String> {
    if app_id.trim().is_empty() || app_id == "__unknown__" {
        return None;
    }

    if let Some(hit) = CACHE.read().get(app_id).cloned() {
        return Some(hit);
    }

    let icon = imp::get_app_icon_png_base64(app_id)?;

    {
        let mut cache = CACHE.write();
        if cache.len() >= MAX_CACHED_ICONS {
            cache.clear();
        }
        cache.insert(app_id.to_string(), icon.clone());
    }

    Some(icon)
}

#[cfg(target_os = "macos")]
mod imp {
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine as _;
    use std::ffi::CString;
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

    unsafe fn msg_send_id_id(receiver: Id, selector: Sel, arg: Id) -> Id {
        let func: extern "C" fn(Id, Sel, Id) -> Id =
            std::mem::transmute(objc_msgSend as *const ());
        func(receiver, selector, arg)
    }

    unsafe fn msg_send_id_ptr(receiver: Id, selector: Sel, arg: *const c_char) -> Id {
        let func: extern "C" fn(Id, Sel, *const c_char) -> Id =
            std::mem::transmute(objc_msgSend as *const ());
        func(receiver, selector, arg)
    }

    unsafe fn msg_send_id_u64_id(receiver: Id, selector: Sel, arg1: u64, arg2: Id) -> Id {
        let func: extern "C" fn(Id, Sel, u64, Id) -> Id =
            std::mem::transmute(objc_msgSend as *const ());
        func(receiver, selector, arg1, arg2)
    }

    unsafe fn msg_send_ptr(receiver: Id, selector: Sel) -> *const c_void {
        let func: extern "C" fn(Id, Sel) -> *const c_void =
            std::mem::transmute(objc_msgSend as *const ());
        func(receiver, selector)
    }

    unsafe fn msg_send_usize(receiver: Id, selector: Sel) -> usize {
        let func: extern "C" fn(Id, Sel) -> usize =
            std::mem::transmute(objc_msgSend as *const ());
        func(receiver, selector)
    }

    unsafe fn nsstring_from_str(value: &str) -> Option<Id> {
        let c = CString::new(value).ok()?;
        let cls = get_class(b"NSString\0") as Id;
        Some(msg_send_id_ptr(
            cls,
            get_sel(b"stringWithUTF8String:\0"),
            c.as_ptr(),
        ))
    }

    pub(super) fn get_app_icon_png_base64(app_id: &str) -> Option<String> {
        unsafe {
            let pool: Id = msg_send_id(get_class(b"NSAutoreleasePool\0") as Id, get_sel(b"new\0"));

            let out = (|| {
                let workspace: Id =
                    msg_send_id(get_class(b"NSWorkspace\0") as Id, get_sel(b"sharedWorkspace\0"));
                if workspace.is_null() {
                    return None;
                }

                let bundle_id = nsstring_from_str(app_id)?;
                let url = msg_send_id_id(
                    workspace,
                    get_sel(b"URLForApplicationWithBundleIdentifier:\0"),
                    bundle_id,
                );
                if url.is_null() {
                    return None;
                }

                let path_ns = msg_send_id(url, get_sel(b"path\0"));
                if path_ns.is_null() {
                    return None;
                }

                let icon: Id = msg_send_id_id(workspace, get_sel(b"iconForFile:\0"), path_ns);
                if icon.is_null() {
                    return None;
                }

                // Best-effort: request 64x64 to keep payload small and UI crisp.
                let size_cls: Id = get_class(b"NSValue\0") as Id;
                if !size_cls.is_null() {
                    // NSValue valueWithSize: requires an NSSize argument; too awkward via msgSend in
                    // this minimal binding, so we skip it and rely on default icon representation.
                }

                let tiff: Id = msg_send_id(icon, get_sel(b"TIFFRepresentation\0"));
                if tiff.is_null() {
                    return None;
                }

                let rep_cls: Id = get_class(b"NSBitmapImageRep\0") as Id;
                if rep_cls.is_null() {
                    return None;
                }
                let rep: Id = msg_send_id_id(rep_cls, get_sel(b"imageRepWithData:\0"), tiff);
                if rep.is_null() {
                    return None;
                }

                let dict_cls: Id = get_class(b"NSDictionary\0") as Id;
                let props: Id = if dict_cls.is_null() {
                    std::ptr::null_mut()
                } else {
                    msg_send_id(dict_cls, get_sel(b"dictionary\0"))
                };

                const NSPNG_FILE_TYPE: u64 = 4;
                let png: Id = msg_send_id_u64_id(
                    rep,
                    get_sel(b"representationUsingType:properties:\0"),
                    NSPNG_FILE_TYPE,
                    props,
                );
                if png.is_null() {
                    return None;
                }

                let bytes = msg_send_ptr(png, get_sel(b"bytes\0")) as *const u8;
                let len = msg_send_usize(png, get_sel(b"length\0"));
                if bytes.is_null() || len == 0 {
                    return None;
                }

                let raw = std::slice::from_raw_parts(bytes, len);
                Some(STANDARD.encode(raw))
            })();

            if !pool.is_null() {
                msg_send_void(pool, get_sel(b"drain\0"));
            }

            out
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    pub(super) fn get_app_icon_png_base64(_app_id: &str) -> Option<String> {
        None
    }
}
