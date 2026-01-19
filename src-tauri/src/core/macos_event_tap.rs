use std::sync::mpsc;

#[derive(Debug, Clone, Copy)]
pub enum RawMouseButton {
    Left,
    Right,
    Other,
}

#[derive(Debug, Clone, Copy)]
pub enum RawInputEvent {
    KeyDown { keycode: u16, flags: u64 },
    MouseDown { button: RawMouseButton, x: f64, y: f64 },
}

#[cfg(target_os = "macos")]
mod imp {
    use super::RawInputEvent;
    use std::{
        ffi::c_void,
        ptr,
        sync::{
            atomic::{AtomicPtr, Ordering},
            mpsc, Mutex,
        },
    };

    type CFIndex = isize;
    type CFAllocatorRef = *const c_void;
    type CFRunLoopRef = *mut c_void;
    type CFRunLoopSourceRef = *mut c_void;
    type CFStringRef = *const c_void;
    type CFMachPortRef = *mut c_void;

    type CGEventTapProxy = *mut c_void;
    type CGEventRef = *mut c_void;
    type CGEventType = u32;
    type CGEventMask = u64;
    type CGEventField = i32;
    type CGEventFlags = u64;

    type CGEventTapLocation = u32;
    type CGEventTapPlacement = u32;
    type CGEventTapOptions = u32;

    const K_CG_HID_EVENT_TAP: CGEventTapLocation = 0;
    const K_CG_HEAD_INSERT_EVENT_TAP: CGEventTapPlacement = 0;
    const K_CG_EVENT_TAP_OPTION_LISTEN_ONLY: CGEventTapOptions = 1;

    const K_CG_EVENT_LEFT_MOUSE_DOWN: CGEventType = 1;
    const K_CG_EVENT_RIGHT_MOUSE_DOWN: CGEventType = 3;
    const K_CG_EVENT_OTHER_MOUSE_DOWN: CGEventType = 25;
    const K_CG_EVENT_KEY_DOWN: CGEventType = 10;
    const K_CG_EVENT_FLAGS_CHANGED: CGEventType = 12;

    const K_CG_EVENT_TAP_DISABLED_BY_TIMEOUT: CGEventType = u32::MAX - 1; // -2
    const K_CG_EVENT_TAP_DISABLED_BY_USER_INPUT: CGEventType = u32::MAX - 2; // -3

    // CoreGraphics constant: kCGKeyboardEventKeycode
    const K_CG_KEYBOARD_EVENT_KEYCODE: CGEventField = 9;

    // CoreGraphics constants: CGEventFlags (CGEventTypes.h)
    const K_CG_EVENT_FLAG_MASK_ALPHA_SHIFT: CGEventFlags = 1 << 16;
    const K_CG_EVENT_FLAG_MASK_SHIFT: CGEventFlags = 1 << 17;
    const K_CG_EVENT_FLAG_MASK_CONTROL: CGEventFlags = 1 << 18;
    const K_CG_EVENT_FLAG_MASK_ALTERNATE: CGEventFlags = 1 << 19;
    const K_CG_EVENT_FLAG_MASK_COMMAND: CGEventFlags = 1 << 20;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventTapCreate(
            tap: CGEventTapLocation,
            place: CGEventTapPlacement,
            options: CGEventTapOptions,
            events_of_interest: CGEventMask,
            callback: extern "C" fn(
                CGEventTapProxy,
                CGEventType,
                CGEventRef,
                *mut c_void,
            ) -> CGEventRef,
            user_info: *mut c_void,
        ) -> CFMachPortRef;

        fn CGEventTapEnable(tap: CFMachPortRef, enable: bool);

        fn CGEventGetIntegerValueField(event: CGEventRef, field: CGEventField) -> i64;
        fn CGEventGetFlags(event: CGEventRef) -> CGEventFlags;
        fn CGEventGetLocation(event: CGEventRef) -> CGPoint;
    }

    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    struct CGPoint {
        x: f64,
        y: f64,
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        static kCFRunLoopCommonModes: CFStringRef;

        fn CFMachPortCreateRunLoopSource(
            allocator: CFAllocatorRef,
            port: CFMachPortRef,
            order: CFIndex,
        ) -> CFRunLoopSourceRef;

        fn CFRunLoopGetCurrent() -> CFRunLoopRef;
        fn CFRunLoopAddSource(rl: CFRunLoopRef, source: CFRunLoopSourceRef, mode: CFStringRef);
        fn CFRunLoopRun();
    }

    struct CallbackCtx {
        tx: mpsc::Sender<RawInputEvent>,
        tap: AtomicPtr<c_void>,
        modifier_down: Mutex<[bool; 256]>,
    }

    static CTX: AtomicPtr<CallbackCtx> = AtomicPtr::new(ptr::null_mut());

    extern "C" fn tap_callback(
        _proxy: CGEventTapProxy,
        event_type: CGEventType,
        event: CGEventRef,
        _user_info: *mut c_void,
    ) -> CGEventRef {
        // Never unwind across FFI.
        let _ = std::panic::catch_unwind(|| {
            let ctx_ptr = CTX.load(Ordering::SeqCst);
            if ctx_ptr.is_null() {
                return;
            }

            let ctx = unsafe { &*ctx_ptr };
            if event_type == K_CG_EVENT_TAP_DISABLED_BY_TIMEOUT
                || event_type == K_CG_EVENT_TAP_DISABLED_BY_USER_INPUT
            {
                let tap = ctx.tap.load(Ordering::SeqCst);
                if !tap.is_null() {
                    unsafe { CGEventTapEnable(tap, true) };
                }
                return;
            }

            let ev = match event_type {
                K_CG_EVENT_KEY_DOWN => {
                    let code =
                        unsafe { CGEventGetIntegerValueField(event, K_CG_KEYBOARD_EVENT_KEYCODE) };
                    let flags = unsafe { CGEventGetFlags(event) };
                    RawInputEvent::KeyDown {
                        keycode: code as u16,
                        flags,
                    }
                }
                // Modifier keys on macOS are reported via `flagsChanged`, not `keyDown`.
                K_CG_EVENT_FLAGS_CHANGED => {
                    let code =
                        unsafe { CGEventGetIntegerValueField(event, K_CG_KEYBOARD_EVENT_KEYCODE) };
                    let code_u16 = code as u16;
                    let idx = code_u16 as usize;
                    if idx >= 256 {
                        return;
                    }

                    // Best-effort: determine "down" without relying on CGEventSourceKeyState (it can
                    // return false under some environments). `flagsChanged` fires on both press and
                    // release, so we track per-key state and only emit on transitions to "down".
                    let flags = unsafe { CGEventGetFlags(event) };
                    let group_mask = match code_u16 {
                        56 | 60 => Some(K_CG_EVENT_FLAG_MASK_SHIFT), // Shift L/R
                        59 | 62 => Some(K_CG_EVENT_FLAG_MASK_CONTROL), // Control L/R
                        58 | 61 => Some(K_CG_EVENT_FLAG_MASK_ALTERNATE), // Option L/R
                        54 | 55 => Some(K_CG_EVENT_FLAG_MASK_COMMAND), // Command L/R
                        57 => Some(K_CG_EVENT_FLAG_MASK_ALPHA_SHIFT), // CapsLock
                        _ => None,
                    };

                    if let Some(mask) = group_mask {
                        // If the whole modifier group is now "up", this event must be a release of
                        // the last pressed key in that group — ensure our per-key state is false
                        // and don't emit.
                        if (flags & mask) == 0 {
                            if let Ok(mut state) = ctx.modifier_down.lock() {
                                state[idx] = false;
                            }
                            return;
                        }
                    }

                    let should_emit = if let Ok(mut state) = ctx.modifier_down.lock() {
                        let was_down = state[idx];
                        // Toggle the per-key state because this key is the one that changed.
                        state[idx] = !was_down;
                        !was_down
                    } else {
                        false
                    };

                    if !should_emit {
                        return;
                    }

                    RawInputEvent::KeyDown {
                        keycode: code_u16,
                        flags,
                    }
                }
                K_CG_EVENT_LEFT_MOUSE_DOWN => {
                    let p = unsafe { CGEventGetLocation(event) };
                    RawInputEvent::MouseDown {
                        button: super::RawMouseButton::Left,
                        x: p.x,
                        y: p.y,
                    }
                }
                K_CG_EVENT_RIGHT_MOUSE_DOWN => {
                    let p = unsafe { CGEventGetLocation(event) };
                    RawInputEvent::MouseDown {
                        button: super::RawMouseButton::Right,
                        x: p.x,
                        y: p.y,
                    }
                }
                K_CG_EVENT_OTHER_MOUSE_DOWN => {
                    let p = unsafe { CGEventGetLocation(event) };
                    RawInputEvent::MouseDown {
                        button: super::RawMouseButton::Other,
                        x: p.x,
                        y: p.y,
                    }
                }
                _ => return,
            };

            let _ = ctx.tx.send(ev);
        });

        event
    }

    fn mask_for(types: &[CGEventType]) -> CGEventMask {
        let mut mask: CGEventMask = 0;
        for &t in types {
            mask |= 1u64 << t;
        }
        mask
    }

    pub(super) fn run(tx: mpsc::Sender<RawInputEvent>) -> Result<(), String> {
        // Keep tx alive for the callback.
        let boxed = Box::new(CallbackCtx {
            tx,
            tap: AtomicPtr::new(ptr::null_mut()),
            modifier_down: Mutex::new([false; 256]),
        });
        let ctx_ptr = Box::into_raw(boxed);
        // If we ever re-run (e.g. after a failed init), leaking the previous ctx is the safest
        // choice because callbacks might still be in-flight on the old pointer.
        let _prev = CTX.swap(ctx_ptr, Ordering::SeqCst);

        let events = mask_for(&[
            K_CG_EVENT_KEY_DOWN,
            K_CG_EVENT_FLAGS_CHANGED,
            K_CG_EVENT_LEFT_MOUSE_DOWN,
            K_CG_EVENT_RIGHT_MOUSE_DOWN,
            K_CG_EVENT_OTHER_MOUSE_DOWN,
        ]);

        let tap = unsafe {
            CGEventTapCreate(
                K_CG_HID_EVENT_TAP,
                K_CG_HEAD_INSERT_EVENT_TAP,
                K_CG_EVENT_TAP_OPTION_LISTEN_ONLY,
                events,
                tap_callback,
                ptr::null_mut(),
            )
        };

        if tap.is_null() {
            return Err(
                "CGEventTapCreate returned null (permission missing or event tap unavailable)"
                    .to_string(),
            );
        }

        unsafe {
            // Safety: ctx_ptr is a valid Box we just allocated and published.
            (*ctx_ptr).tap.store(tap, Ordering::SeqCst);
        }

        let run_loop = unsafe { CFRunLoopGetCurrent() };
        if run_loop.is_null() {
            return Err("CFRunLoopGetCurrent returned null".to_string());
        }

        let source = unsafe { CFMachPortCreateRunLoopSource(ptr::null(), tap, 0) };
        if source.is_null() {
            return Err("CFMachPortCreateRunLoopSource returned null".to_string());
        }

        unsafe {
            CFRunLoopAddSource(run_loop, source, kCFRunLoopCommonModes);
            CGEventTapEnable(tap, true);
            CFRunLoopRun();
        }

        Ok(())
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    use super::RawInputEvent;
    use std::sync::mpsc;

    pub(super) fn run(_tx: mpsc::Sender<RawInputEvent>) -> Result<(), String> {
        Err("macOS event tap is not supported on this platform".to_string())
    }
}

pub fn run(tx: mpsc::Sender<RawInputEvent>) -> Result<(), String> {
    imp::run(tx)
}
