#[cfg(not(target_os = "macos"))]
use rdev::Key;

#[cfg(not(target_os = "macos"))]
fn normalize_key_code(raw: &str) -> Option<String> {
    if raw.is_empty() {
        return None;
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
        123 => "ArrowLeft",
        124 => "ArrowRight",
        125 => "ArrowDown",
        126 => "ArrowUp",
        _ => return None,
    })
}
