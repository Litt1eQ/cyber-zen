#[cfg(not(target_os = "macos"))]
use rdev::Key;

#[cfg(not(target_os = "macos"))]
fn normalize_key_code(raw: &str) -> Option<String> {
    if raw.is_empty() {
        return None;
    }

    if let Some(digit) = raw.strip_prefix("NumPad") {
        if digit.len() == 1 && digit.chars().all(|c| c.is_ascii_digit()) {
            return Some(format!("Numpad{}", digit));
        }
    }
    if let Some(digit) = raw.strip_prefix("Numpad") {
        if digit.len() == 1 && digit.chars().all(|c| c.is_ascii_digit()) {
            return Some(format!("Numpad{}", digit));
        }
    }
    if let Some(digit) = raw.strip_prefix("Kp") {
        if digit.len() == 1 && digit.chars().all(|c| c.is_ascii_digit()) {
            return Some(format!("Numpad{}", digit));
        }
    }

    if raw.len() == 4 && raw.starts_with("Key") {
        return Some(raw.to_string());
    }

    if let Some(digit) = raw.strip_prefix("Num") {
        if digit.len() == 1 && digit.chars().all(|c| c.is_ascii_digit()) {
            return Some(format!("Digit{}", digit));
        }
    }

    let mapped = match raw {
        "Return" => "Enter",
        "Esc" | "Escape" => "Escape",
        "Backspace" => "Backspace",
        "Tab" => "Tab",
        "Space" => "Space",
        "CapsLock" => "CapsLock",
        "ShiftLeft" | "ShiftRight" => raw,
        "ControlLeft" | "ControlRight" => raw,
        "Alt" | "AltLeft" => "AltLeft",
        "AltGr" | "AltRight" => "AltRight",
        "MetaLeft" | "MetaRight" => raw,
        "Super" => "MetaLeft",
        "Minus" => "Minus",
        "Equal" => "Equal",
        "BackQuote" | "Backtick" | "Grave" | "GraveAccent" => "Backquote",
        "LeftBracket" | "BracketLeft" => "BracketLeft",
        "RightBracket" | "BracketRight" => "BracketRight",
        "BackSlash" | "Backslash" => "Backslash",
        "SemiColon" | "Semicolon" => "Semicolon",
        "Quote" | "Apostrophe" => "Quote",
        "Comma" => "Comma",
        "Dot" | "Period" => "Period",
        "Slash" => "Slash",
        "ArrowLeft" | "LeftArrow" => "ArrowLeft",
        "ArrowRight" | "RightArrow" => "ArrowRight",
        "ArrowUp" | "UpArrow" => "ArrowUp",
        "ArrowDown" | "DownArrow" => "ArrowDown",
        "NumLock" | "Numlock" => "NumLock",
        "NumPadAdd" | "NumpadAdd" | "NumPadPlus" => "NumpadAdd",
        "NumPadSubtract" | "NumpadSubtract" | "NumPadMinus" => "NumpadSubtract",
        "NumPadMultiply" | "NumpadMultiply" => "NumpadMultiply",
        "NumPadDivide" | "NumpadDivide" => "NumpadDivide",
        "NumPadDecimal" | "NumpadDecimal" => "NumpadDecimal",
        "NumPadEnter" | "NumpadEnter" | "KpEnter" | "KpReturn" => "NumpadEnter",
        "KpPlus" => "NumpadAdd",
        "KpMinus" => "NumpadSubtract",
        "KpMultiply" => "NumpadMultiply",
        "KpDivide" => "NumpadDivide",
        "KpDelete" => "NumpadDecimal",
        "NumPadEqual" | "NumpadEqual" => "NumpadEqual",
        "Function" | "Fn" => "Fn",
        _ => return None,
    };

    Some(mapped.to_string())
}

#[cfg(not(target_os = "macos"))]
pub fn from_rdev_key(key: Key) -> Option<String> {
    let raw = format!("{:?}", key);
    normalize_key_code(&raw).or(Some(raw))
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
