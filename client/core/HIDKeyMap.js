/**
 * client/core/HIDKeyMap.js
 *
 * Shared HID key mappings used by both the web renderer and the Electron main process.
 * No browser or Node.js-specific dependencies — pure static data + a tiny parse helper.
 */

// Mapping from JS keyboard event key names to TinyUSB HID byte codes.
export const HIDMap = {
    "Control"         : 0x80,
    "Shift"           : 0x81,
    "Alt"             : 0x82,
    "Meta"            : 0x83,
    "Super"           : 0x83,
    "KEY_RIGHT_CTRL"  : 0x84,
    "KEY_RIGHT_SHIFT" : 0x85,
    "KEY_RIGHT_ALT"   : 0x86,
    "KEY_RIGHT_GUI"   : 0x87,
    "ArrowUp"         : 0xDA,
    "ArrowDown"       : 0xD9,
    "ArrowLeft"       : 0xD8,
    "ArrowRight"      : 0xD7,
    "Backspace"       : 0xB2,
    "Tab"             : 0xB3,
    "Enter"           : 0xB0,
    "Escape"          : 0xB1,
    "Insert"          : 0xD1,
    "Delete"          : 0xD4,
    "PageUp"          : 0xD3,
    "PageDown"        : 0xD6,
    "Home"            : 0xD2,
    "End"             : 0xD5,
    "F1"              : 0xC2,
    "F2"              : 0xC3,
    "F3"              : 0xC4,
    "F4"              : 0xC5,
    "F5"              : 0xC6,
    "F6"              : 0xC7,
    "F7"              : 0xC8,
    "F8"              : 0xC9,
    "F9"              : 0xCA,
    "F10"             : 0xCB,
    "F11"             : 0xCC,
    "F12"             : 0xCD,
    "F13"             : 0xF0,
    "F14"             : 0xF1,
    "F15"             : 0xF2,
    "F16"             : 0xF3,
    "F17"             : 0xF4,
    "F18"             : 0xF5,
    "F19"             : 0xF6,
    "F20"             : 0xF7,
    "F21"             : 0xF8,
    "F22"             : 0xF9,
    "F23"             : 0xFA,
    "F24"             : 0xFB,
};

// Modifier key aliases → canonical JS key names accepted by HIDMap.
export const modifierAliases = {
    'ctrl'    : 'Control',
    'control' : 'Control',
    'alt'     : 'Alt',
    'shift'   : 'Shift',
    'meta'    : 'Meta',
    'win'     : 'Meta',
    'windows' : 'Meta',
    'cmd'     : 'Meta',
    'command' : 'Meta',
};

// Key name aliases → canonical JS key names accepted by HIDMap / charCodeAt fallback.
export const keyAliases = {
    'enter'      : 'Enter',
    'return'     : 'Enter',
    'tab'        : 'Tab',
    'escape'     : 'Escape',
    'esc'        : 'Escape',
    'backspace'  : 'Backspace',
    'delete'     : 'Delete',
    'del'        : 'Delete',
    'space'      : ' ',
    'arrowup'    : 'ArrowUp',
    'arrowdown'  : 'ArrowDown',
    'arrowleft'  : 'ArrowLeft',
    'arrowright' : 'ArrowRight',
    'pageup'     : 'PageUp',
    'pagedown'   : 'PageDown',
    'home'       : 'Home',
    'end'        : 'End',
    'insert'     : 'Insert',
};

/**
 * Parse a key combo string such as "ctrl+shift+a" or "Meta+r" into its
 * canonical key name and resolved modifier list.
 *
 * @param {string} combo - e.g. "ctrl+c", "shift+alt+Delete", "Enter"
 * @returns {{ key: string, modifiers: string[] }}
 */
export function parseKeyCombo(combo) {
    const parts = (combo || '').toLowerCase().split('+');
    const rawKey = parts[parts.length - 1];
    const rawMods = parts.slice(0, -1);

    const modifiers = rawMods.map(m => modifierAliases[m] || m);
    const key = keyAliases[rawKey] || rawKey;

    return { key, modifiers };
}
