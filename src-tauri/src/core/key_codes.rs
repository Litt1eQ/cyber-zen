use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::Arc;

static CANONICAL_ARCS: Lazy<HashMap<&'static str, Arc<str>>> = Lazy::new(|| {
    let list: &[&'static str] = &[
        "AltLeft",
        "AltRight",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "Backquote",
        "Backslash",
        "Backspace",
        "BracketLeft",
        "BracketRight",
        "CapsLock",
        "Comma",
        "ControlLeft",
        "ControlRight",
        "Delete",
        "Digit0",
        "Digit1",
        "Digit2",
        "Digit3",
        "Digit4",
        "Digit5",
        "Digit6",
        "Digit7",
        "Digit8",
        "Digit9",
        "End",
        "Enter",
        "Equal",
        "Escape",
        "F1",
        "F2",
        "F3",
        "F4",
        "F5",
        "F6",
        "F7",
        "F8",
        "F9",
        "F10",
        "F11",
        "F12",
        "F13",
        "F14",
        "F15",
        "F16",
        "Fn",
        "Home",
        "Insert",
        "KeyA",
        "KeyB",
        "KeyC",
        "KeyD",
        "KeyE",
        "KeyF",
        "KeyG",
        "KeyH",
        "KeyI",
        "KeyJ",
        "KeyK",
        "KeyL",
        "KeyM",
        "KeyN",
        "KeyO",
        "KeyP",
        "KeyQ",
        "KeyR",
        "KeyS",
        "KeyT",
        "KeyU",
        "KeyV",
        "KeyW",
        "KeyX",
        "KeyY",
        "KeyZ",
        "MetaLeft",
        "MetaRight",
        "Minus",
        "NumLock",
        "Numpad0",
        "Numpad1",
        "Numpad2",
        "Numpad3",
        "Numpad4",
        "Numpad5",
        "Numpad6",
        "Numpad7",
        "Numpad8",
        "Numpad9",
        "NumpadAdd",
        "NumpadDecimal",
        "NumpadDivide",
        "NumpadEnter",
        "NumpadEqual",
        "NumpadMultiply",
        "NumpadSubtract",
        "PageDown",
        "PageUp",
        "Pause",
        "Period",
        "PrintScreen",
        "Quote",
        "ScrollLock",
        "Semicolon",
        "ShiftLeft",
        "ShiftRight",
        "Slash",
        "Space",
        "Tab",
    ];

    let mut out = HashMap::with_capacity(list.len());
    for &s in list {
        out.insert(s, Arc::<str>::from(s));
    }
    out
});

pub fn intern(code: &str) -> Arc<str> {
    CANONICAL_ARCS
        .get(code)
        .cloned()
        .unwrap_or_else(|| Arc::<str>::from(code))
}

#[cfg(not(target_os = "macos"))]
pub fn from_rdev_key(key: rdev::Key) -> Arc<str> {
    use rdev::Key;

    let code: Option<&'static str> = match key {
        Key::Alt => Some("AltLeft"),
        Key::AltGr => Some("AltRight"),
        Key::Backspace => Some("Backspace"),
        Key::CapsLock => Some("CapsLock"),
        Key::Comma => Some("Comma"),
        Key::ControlLeft => Some("ControlLeft"),
        Key::ControlRight => Some("ControlRight"),
        Key::Delete => Some("Delete"),
        Key::Dot => Some("Period"),
        Key::DownArrow => Some("ArrowDown"),
        Key::End => Some("End"),
        Key::Equal => Some("Equal"),
        Key::Escape => Some("Escape"),
        Key::F1 => Some("F1"),
        Key::F2 => Some("F2"),
        Key::F3 => Some("F3"),
        Key::F4 => Some("F4"),
        Key::F5 => Some("F5"),
        Key::F6 => Some("F6"),
        Key::F7 => Some("F7"),
        Key::F8 => Some("F8"),
        Key::F9 => Some("F9"),
        Key::F10 => Some("F10"),
        Key::F11 => Some("F11"),
        Key::F12 => Some("F12"),
        Key::Function => Some("Fn"),
        Key::Home => Some("Home"),
        Key::Insert => Some("Insert"),
        Key::IntlBackslash => Some("Backslash"),
        Key::KeyA => Some("KeyA"),
        Key::KeyB => Some("KeyB"),
        Key::KeyC => Some("KeyC"),
        Key::KeyD => Some("KeyD"),
        Key::KeyE => Some("KeyE"),
        Key::KeyF => Some("KeyF"),
        Key::KeyG => Some("KeyG"),
        Key::KeyH => Some("KeyH"),
        Key::KeyI => Some("KeyI"),
        Key::KeyJ => Some("KeyJ"),
        Key::KeyK => Some("KeyK"),
        Key::KeyL => Some("KeyL"),
        Key::KeyM => Some("KeyM"),
        Key::KeyN => Some("KeyN"),
        Key::KeyO => Some("KeyO"),
        Key::KeyP => Some("KeyP"),
        Key::KeyQ => Some("KeyQ"),
        Key::KeyR => Some("KeyR"),
        Key::KeyS => Some("KeyS"),
        Key::KeyT => Some("KeyT"),
        Key::KeyU => Some("KeyU"),
        Key::KeyV => Some("KeyV"),
        Key::KeyW => Some("KeyW"),
        Key::KeyX => Some("KeyX"),
        Key::KeyY => Some("KeyY"),
        Key::KeyZ => Some("KeyZ"),
        Key::Kp0 => Some("Numpad0"),
        Key::Kp1 => Some("Numpad1"),
        Key::Kp2 => Some("Numpad2"),
        Key::Kp3 => Some("Numpad3"),
        Key::Kp4 => Some("Numpad4"),
        Key::Kp5 => Some("Numpad5"),
        Key::Kp6 => Some("Numpad6"),
        Key::Kp7 => Some("Numpad7"),
        Key::Kp8 => Some("Numpad8"),
        Key::Kp9 => Some("Numpad9"),
        Key::KpDelete => Some("NumpadDecimal"),
        Key::KpDivide => Some("NumpadDivide"),
        Key::KpMinus => Some("NumpadSubtract"),
        Key::KpMultiply => Some("NumpadMultiply"),
        Key::KpPlus => Some("NumpadAdd"),
        Key::KpReturn | Key::Return => Some("Enter"),
        Key::LeftArrow => Some("ArrowLeft"),
        Key::LeftBracket => Some("BracketLeft"),
        Key::MetaLeft => Some("MetaLeft"),
        Key::MetaRight => Some("MetaRight"),
        Key::Minus => Some("Minus"),
        Key::Num0 => Some("Digit0"),
        Key::Num1 => Some("Digit1"),
        Key::Num2 => Some("Digit2"),
        Key::Num3 => Some("Digit3"),
        Key::Num4 => Some("Digit4"),
        Key::Num5 => Some("Digit5"),
        Key::Num6 => Some("Digit6"),
        Key::Num7 => Some("Digit7"),
        Key::Num8 => Some("Digit8"),
        Key::Num9 => Some("Digit9"),
        Key::NumLock => Some("NumLock"),
        Key::PageDown => Some("PageDown"),
        Key::PageUp => Some("PageUp"),
        Key::Pause => Some("Pause"),
        Key::PrintScreen => Some("PrintScreen"),
        Key::Quote => Some("Quote"),
        Key::RightArrow => Some("ArrowRight"),
        Key::RightBracket => Some("BracketRight"),
        Key::ScrollLock => Some("ScrollLock"),
        Key::SemiColon => Some("Semicolon"),
        Key::ShiftLeft => Some("ShiftLeft"),
        Key::ShiftRight => Some("ShiftRight"),
        Key::Slash => Some("Slash"),
        Key::Space => Some("Space"),
        Key::Tab => Some("Tab"),
        Key::UpArrow => Some("ArrowUp"),
        Key::BackQuote => Some("Backquote"),
        Key::BackSlash => Some("Backslash"),
        Key::Unknown(id) => {
            return Arc::<str>::from(format!("Unknown({})", id));
        }
    };

    if let Some(code) = code {
        return intern(code);
    }

    // Fallback should be unreachable due to the exhaustive match above, but keep it safe.
    Arc::<str>::from(format!("{:?}", key))
}

#[cfg(target_os = "macos")]
pub fn from_macos_virtual_keycode(keycode: u16) -> Option<&'static str> {
    // Canonical codes largely follow the web `KeyboardEvent.code` naming.
    // Source for keycodes: Apple's "HIToolbox/Events.h" (kVK_* constants).
    Some(match keycode {
        0 => "KeyA",
        1 => "KeyS",
        2 => "KeyD",
        3 => "KeyF",
        4 => "KeyH",
        5 => "KeyG",
        6 => "KeyZ",
        7 => "KeyX",
        8 => "KeyC",
        9 => "KeyV",
        11 => "KeyB",
        12 => "KeyQ",
        13 => "KeyW",
        14 => "KeyE",
        15 => "KeyR",
        16 => "KeyY",
        17 => "KeyT",
        18 => "Digit1",
        19 => "Digit2",
        20 => "Digit3",
        21 => "Digit4",
        22 => "Digit6",
        23 => "Digit5",
        24 => "Equal",
        25 => "Digit9",
        26 => "Digit7",
        27 => "Minus",
        28 => "Digit8",
        29 => "Digit0",
        30 => "BracketRight",
        31 => "KeyO",
        32 => "KeyU",
        33 => "BracketLeft",
        34 => "KeyI",
        35 => "KeyP",
        36 => "Enter",
        37 => "KeyL",
        38 => "KeyJ",
        39 => "Quote",
        40 => "KeyK",
        41 => "Semicolon",
        42 => "Backslash",
        43 => "Comma",
        44 => "Slash",
        45 => "KeyN",
        46 => "KeyM",
        47 => "Period",
        48 => "Tab",
        49 => "Space",
        50 => "Backquote",
        51 => "Backspace",
        53 => "Escape",
        54 => "MetaRight",
        55 => "MetaLeft",
        56 => "ShiftLeft",
        57 => "CapsLock",
        58 => "AltLeft",
        59 => "ControlLeft",
        60 => "ShiftRight",
        61 => "AltRight",
        62 => "ControlRight",
        63 => "Fn",
        65 => "NumpadDecimal",
        67 => "NumpadMultiply",
        69 => "NumpadAdd",
        71 => "NumLock",
        72 => "Pause",
        75 => "NumpadDivide",
        76 => "NumpadEnter",
        78 => "NumpadSubtract",
        81 => "NumpadEqual",
        82 => "Numpad0",
        83 => "Numpad1",
        84 => "Numpad2",
        85 => "Numpad3",
        86 => "Numpad4",
        87 => "Numpad5",
        88 => "Numpad6",
        89 => "Numpad7",
        91 => "Numpad8",
        92 => "Numpad9",
        96 => "F5",
        97 => "F6",
        98 => "F7",
        99 => "F3",
        100 => "F8",
        101 => "F9",
        103 => "F11",
        105 => "F13",
        106 => "F16",
        107 => "F14",
        109 => "F10",
        111 => "F12",
        113 => "F15",
        114 => "Insert",
        115 => "Home",
        116 => "PageUp",
        117 => "Delete",
        118 => "F4",
        119 => "End",
        120 => "F2",
        121 => "PageDown",
        122 => "F1",
        123 => "ArrowLeft",
        124 => "ArrowRight",
        125 => "ArrowDown",
        126 => "ArrowUp",
        _ => return None,
    })
}

#[cfg(target_os = "macos")]
pub fn normalize_macos_key_code(code: &str) -> &str {
    // macOS modifier remaps (System Settings → Keyboard → Modifier Keys) can cause the
    // OS to report a swapped key as a "right" variant (e.g. ControlRight) even on keyboards
    // that don't physically have it (like MacBook internal keyboards). For counting purposes,
    // normalize to stable left-side codes.
    match code {
        "ControlRight" => "ControlLeft",
        _ => code,
    }
}

#[cfg(target_os = "macos")]
pub fn from_macos_virtual_keycode_arc(keycode: u16) -> Option<Arc<str>> {
    let raw = from_macos_virtual_keycode(keycode)?;
    let normalized = normalize_macos_key_code(raw);
    // Note: most canonical codes are in the intern table, but fall back safely if not.
    Some(intern(normalized))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    #[test]
    fn intern_returns_stable_arc_for_canonical_code() {
        let a = intern("KeyA");
        let b = intern("KeyA");
        assert!(Arc::ptr_eq(&a, &b));
        assert_eq!(a.as_ref(), "KeyA");
    }

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn from_rdev_key_uses_intern_table() {
        let code = from_rdev_key(rdev::Key::KeyA);
        let canonical = intern("KeyA");
        assert!(Arc::ptr_eq(&code, &canonical));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_keycode_mapping_is_normalized_and_interned() {
        let a = from_macos_virtual_keycode_arc(0).expect("KeyA");
        assert!(Arc::ptr_eq(&a, &intern("KeyA")));

        // kVK_Control (right) should normalize to ControlLeft.
        let ctrl = from_macos_virtual_keycode_arc(62).expect("Control");
        assert!(Arc::ptr_eq(&ctrl, &intern("ControlLeft")));
    }
}
