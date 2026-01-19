use std::sync::mpsc;

#[derive(Debug, Clone, Copy)]
pub enum RawMouseButton {
    Left,
    Right,
    Other,
}

#[derive(Debug, Clone, Copy)]
pub enum RawInputEvent {
    /// A key press that should be counted.
    ///
    /// `keycode` is the inferred *logical* keycode (after macOS modifier remaps).
    KeyDown { keycode: u16, flags: u64 },
    MouseDown { button: RawMouseButton, x: f64, y: f64 },
    MouseMove { x: f64, y: f64 },
}

// CoreGraphics constants: CGEventFlags (CGEventTypes.h)
const FLAG_MASK_ALPHA_SHIFT: u64 = 1 << 16;
const FLAG_MASK_SHIFT: u64 = 1 << 17;
const FLAG_MASK_CONTROL: u64 = 1 << 18;
const FLAG_MASK_ALTERNATE: u64 = 1 << 19;
const FLAG_MASK_COMMAND: u64 = 1 << 20;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ModifierGroup {
    Shift,
    Control,
    Alt,
    Command,
    CapsLock,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ModifierSide {
    Left,
    Right,
}

fn flag_mask_for_group(group: ModifierGroup) -> u64 {
    match group {
        ModifierGroup::Shift => FLAG_MASK_SHIFT,
        ModifierGroup::Control => FLAG_MASK_CONTROL,
        ModifierGroup::Alt => FLAG_MASK_ALTERNATE,
        ModifierGroup::Command => FLAG_MASK_COMMAND,
        ModifierGroup::CapsLock => FLAG_MASK_ALPHA_SHIFT,
    }
}

fn expected_group_for_physical_keycode(keycode: u16) -> Option<ModifierGroup> {
    match keycode {
        56 | 60 => Some(ModifierGroup::Shift),    // Shift L/R
        59 | 62 => Some(ModifierGroup::Control),  // Control L/R
        58 | 61 => Some(ModifierGroup::Alt),      // Option L/R
        54 | 55 => Some(ModifierGroup::Command),  // Command R/L
        57 => Some(ModifierGroup::CapsLock),      // CapsLock
        _ => None,
    }
}

fn side_from_physical_keycode(keycode: u16) -> ModifierSide {
    match keycode {
        60 | 61 | 62 | 54 => ModifierSide::Right,
        _ => ModifierSide::Left,
    }
}

fn logical_keycode_for_group(group: ModifierGroup, side: ModifierSide) -> u16 {
    match group {
        ModifierGroup::Shift => match side {
            ModifierSide::Left => 56,
            ModifierSide::Right => 60,
        },
        ModifierGroup::Control => match side {
            ModifierSide::Left => 59,
            ModifierSide::Right => 62,
        },
        ModifierGroup::Alt => match side {
            ModifierSide::Left => 58,
            ModifierSide::Right => 61,
        },
        ModifierGroup::Command => match side {
            // Note: Apple's keycodes are reversed compared to the typical L/R ordering.
            // kVK_Command (left) = 55, kVK_RightCommand = 54.
            ModifierSide::Left => 55,
            ModifierSide::Right => 54,
        },
        ModifierGroup::CapsLock => 57,
    }
}

fn infer_effective_modifier_group(
    prev_flags: u64,
    flags: u64,
    physical_keycode: u16,
) -> Option<ModifierGroup> {
    let expected = expected_group_for_physical_keycode(physical_keycode)?;
    let changed = prev_flags ^ flags;
    let mut changed_groups: [Option<ModifierGroup>; 5] = [None; 5];
    let mut n = 0usize;
    for group in [
        ModifierGroup::CapsLock,
        ModifierGroup::Shift,
        ModifierGroup::Control,
        ModifierGroup::Alt,
        ModifierGroup::Command,
    ] {
        if (changed & flag_mask_for_group(group)) != 0 {
            changed_groups[n] = Some(group);
            n += 1;
        }
    }

    if n == 1 {
        return changed_groups[0];
    }
    if n > 1 {
        for g in changed_groups.iter().flatten() {
            if *g == expected {
                return Some(expected);
            }
        }
        return changed_groups[0];
    }

    // No flag bit changed (common when another key in the same modifier group is already held,
    // or under some remap scenarios). Prefer any *currently active* modifier group in `flags`,
    // falling back to the expected physical group.
    if (flags & flag_mask_for_group(expected)) != 0 {
        return Some(expected);
    }
    for group in [
        ModifierGroup::Control,
        ModifierGroup::Shift,
        ModifierGroup::Alt,
        ModifierGroup::Command,
        ModifierGroup::CapsLock,
    ] {
        if (flags & flag_mask_for_group(group)) != 0 {
            return Some(group);
        }
    }
    Some(expected)
}

#[derive(Debug, Clone)]
struct FlagsChangedState {
    down: [bool; 256],
    last_flags: u64,
}

impl Default for FlagsChangedState {
    fn default() -> Self {
        Self {
            down: [false; 256],
            last_flags: 0,
        }
    }
}

fn process_flags_changed(
    state: &mut FlagsChangedState,
    physical_keycode: u16,
    flags: u64,
) -> Option<u16> {
    let idx = physical_keycode as usize;
    if idx >= 256 {
        return None;
    }

    let prev_flags = state.last_flags;
    state.last_flags = flags;

    let effective_group = infer_effective_modifier_group(prev_flags, flags, physical_keycode);
    let logical_keycode = effective_group
        .map(|group| logical_keycode_for_group(group, side_from_physical_keycode(physical_keycode)))
        .unwrap_or(physical_keycode);

    let changed = prev_flags ^ flags;

    let Some(group) = effective_group else {
        // Fallback: maintain old best-effort toggling behavior.
        let was_down = state.down[idx];
        state.down[idx] = !was_down;
        return (!was_down).then_some(logical_keycode);
    };

    if group == ModifierGroup::CapsLock {
        // CapsLock is a toggle; only count the key press when the alpha-shift bit changes.
        // (macOS may also emit a second `flagsChanged` on key release with no flag change.)
        state.down[idx] = false;
        return ((changed & FLAG_MASK_ALPHA_SHIFT) != 0).then_some(logical_keycode);
    }

    // For non-toggle modifiers, infer press/release from the corresponding flag bit, which is more
    // stable than blindly toggling per-key state (especially under modifier remaps).
    let mask = flag_mask_for_group(group);
    let is_down_now = (flags & mask) != 0;
    let was_down = state.down[idx];
    state.down[idx] = is_down_now;
    (is_down_now && !was_down).then_some(logical_keycode)
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
    const K_CG_EVENT_MOUSE_MOVED: CGEventType = 5;
    const K_CG_EVENT_LEFT_MOUSE_DRAGGED: CGEventType = 6;
    const K_CG_EVENT_RIGHT_MOUSE_DRAGGED: CGEventType = 7;
    const K_CG_EVENT_OTHER_MOUSE_DRAGGED: CGEventType = 27;
    const K_CG_EVENT_KEY_DOWN: CGEventType = 10;
    const K_CG_EVENT_FLAGS_CHANGED: CGEventType = 12;

    const K_CG_EVENT_TAP_DISABLED_BY_TIMEOUT: CGEventType = u32::MAX - 1; // -2
    const K_CG_EVENT_TAP_DISABLED_BY_USER_INPUT: CGEventType = u32::MAX - 2; // -3

    // CoreGraphics constant: kCGKeyboardEventKeycode
    const K_CG_KEYBOARD_EVENT_KEYCODE: CGEventField = 9;

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
        flags_state: Mutex<super::FlagsChangedState>,
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
                    let keycode = code as u16;
                    RawInputEvent::KeyDown { keycode, flags }
                }
                // Modifier keys on macOS are reported via `flagsChanged`, not `keyDown`.
                K_CG_EVENT_FLAGS_CHANGED => {
                    let code =
                        unsafe { CGEventGetIntegerValueField(event, K_CG_KEYBOARD_EVENT_KEYCODE) };
                    let flags = unsafe { CGEventGetFlags(event) };
                    let physical_keycode = code as u16;

                    let logical_keycode = if let Ok(mut st) = ctx.flags_state.lock() {
                        super::process_flags_changed(&mut st, physical_keycode, flags)
                    } else {
                        None
                    };

                    let Some(logical_keycode) = logical_keycode else {
                        return;
                    };

                    RawInputEvent::KeyDown {
                        keycode: logical_keycode,
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
                K_CG_EVENT_MOUSE_MOVED
                | K_CG_EVENT_LEFT_MOUSE_DRAGGED
                | K_CG_EVENT_RIGHT_MOUSE_DRAGGED
                | K_CG_EVENT_OTHER_MOUSE_DRAGGED => {
                    let p = unsafe { CGEventGetLocation(event) };
                    RawInputEvent::MouseMove { x: p.x, y: p.y }
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
            flags_state: Mutex::new(super::FlagsChangedState::default()),
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
            K_CG_EVENT_MOUSE_MOVED,
            K_CG_EVENT_LEFT_MOUSE_DRAGGED,
            K_CG_EVENT_RIGHT_MOUSE_DRAGGED,
            K_CG_EVENT_OTHER_MOUSE_DRAGGED,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remapped_caps_lock_to_control_infers_control_logical_keycode() {
        let mut st = FlagsChangedState::default();
        let control_down = FLAG_MASK_CONTROL;

        // Physical keycode is CapsLock (57), but flags indicate Control is down.
        let keycode = process_flags_changed(&mut st, 57, control_down);
        assert_eq!(keycode, Some(59)); // ControlLeft
    }

    #[test]
    fn remapped_control_to_caps_lock_infers_caps_lock_logical_keycode() {
        let mut st = FlagsChangedState::default();
        let caps_lock_on = FLAG_MASK_ALPHA_SHIFT;

        // Physical keycode is ControlLeft (59), but flags indicate CapsLock toggled on.
        let keycode = process_flags_changed(&mut st, 59, caps_lock_on);
        assert_eq!(keycode, Some(57)); // CapsLock
    }

    #[test]
    fn caps_lock_toggle_off_still_counts_press() {
        let mut st = FlagsChangedState::default();
        // Pretend CapsLock is currently on.
        st.last_flags = FLAG_MASK_ALPHA_SHIFT;

        // Pressing CapsLock toggles it off (alpha shift cleared). We should still emit a press.
        let keycode = process_flags_changed(&mut st, 57, 0);
        assert_eq!(keycode, Some(57)); // CapsLock
    }
}
