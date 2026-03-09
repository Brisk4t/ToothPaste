---
applyTo: "**"
description: "Use when controlling the ToothPaste BLE HID device via MCP tools — typing, mouse, keys, media, serial read"
---

# ToothPaste MCP — Agent Usage Guide

## What is ToothPaste?

ToothPaste is a BLE HID bridge device. It acts as a wireless USB HID adapter — you send keyboard, mouse, and media commands to it over BLE, and it injects them as real USB HID events into the target machine it is physically plugged into. It also has a USB CDC serial port; anything written to that serial port is echoed back over BLE as `SERIAL_DATA` notifications.

**You are the agent.** You control the target machine (the one ToothPaste is plugged into) entirely through the MCP tools below. You do not have direct access to that machine's filesystem or terminal — every interaction happens through BLE HID.

The full control chain:
```
You (agent) → MCP HTTP API (port 27831) → Electron IPC → React/BLE renderer → BLE → ToothPaste firmware → target machine USB HID
```

The MCP HTTP server runs **inside the Electron app** already open on the developer's machine. There is nothing to start or install. VS Code connects via `.vscode/mcp.json` with `type: "http"` pointing at `http://127.0.0.1:27831/mcp`.

---

## Step 1 — Always verify the device is ready first

Call `get_status` before doing anything else. Do not proceed if `ready` or `connected` is false.

```json
// Expected healthy response:
{ "status": "ready", "statusCode": 1, "ready": true, "connected": true, "deviceName": "Toothpaste" }
```

If not ready, tell the user to check the Electron app UI — the device needs to be powered on, in BLE range, and authenticated.

---

## Step 2 — Understand the tools

There are 9 tools total. Each is described below with exact parameter names, types, and critical gotchas.

---

### `get_status`
No parameters. Returns device connection/authentication state.

---

### `type_text`
Types a string as keyboard input on the target machine.

**Parameters:**
- `text` (string, required) — the text to type
- `slowMode` (integer ms, optional, default 0) — delay between BLE packets

**CRITICAL — always use `slowMode: 5` for any string longer than ~20 characters.**
At `slowMode: 0`, the BLE transport drops keystrokes silently. Short strings (≤20 chars) are fine at 0. For PowerShell commands, file paths, or anything substantial, use 5.

```json
// Short string — ok at default:
{ "text": "wt" }

// Long string — MUST use slowMode 5:
{ "text": "$s = New-Object System.IO.Ports.SerialPort('COM7',115200); $s.Open(); ...", "slowMode": 5 }
```

---

### `press_key`
Presses a single key or modifier combination.

**Parameters:**
- `key` (string, required) — key name or combo
- `slowMode` (integer ms, optional) — not usually needed for single keys

**Exact key names — these are case-sensitive and must match exactly:**

| What you want | Correct string |
|---------------|----------------|
| Enter | `"Enter"` |
| Escape | `"Escape"` |
| Tab | `"Tab"` |
| Backspace | `"Backspace"` |
| Delete | `"Delete"` |
| Space bar | `" "` (literal space character) |
| Arrow Up | `"ArrowUp"` |
| Arrow Down | `"ArrowDown"` |
| Arrow Left | `"ArrowLeft"` |
| Arrow Right | `"ArrowRight"` |
| Windows key | `"Meta"` (**NOT** `"Super"` — `Super` silently drops the modifier in combos) |
| F1 through F24 | `"F1"` … `"F24"` |
| Home | `"Home"` |
| End | `"End"` |
| Page Up | `"PageUp"` |
| Page Down | `"PageDown"` |
| Insert | `"Insert"` |

**Modifier combos** — join with `+`:
- `"ctrl+c"` — copy
- `"ctrl+shift+t"` — reopen tab
- `"Meta+r"` — Win+R (Run dialog) — **always use `Meta`, never `Super` or `win`**
- `"alt+F4"` — close window

**Lowercase aliases** resolved automatically: `enter`/`return` → `Enter`, `esc` → `Escape`, `del` → `Delete`

**NEVER use `"Return"`** — it does not exist in the HID map. Always use `"Enter"`.

---

### `mouse_move`
Moves the mouse cursor by a relative pixel offset from its current position.

**Parameters:**
- `x` (integer, required) — pixels to move right (negative = left)
- `y` (integer, required) — pixels to move down (negative = up)

Movement is **relative, not absolute**. You cannot jump to screen coordinates. To navigate to a known position, move in increments. To draw shapes like a circle, compute deltas between consecutive points.

---

### `mouse_click`
Clicks a mouse button at the current cursor position.

**Parameters:**
- `button` (string, optional, default `"left"`) — `"left"`, `"right"`, or `"middle"`

---

### `mouse_scroll`
Scrolls the mouse wheel.

**Parameters:**
- `delta` (integer, required) — positive = scroll down, negative = scroll up

---

### `media_control`
Sends a media or system control key. Does not require focus on any window.

**Parameters:**
- `action` (string, required) — one of: `"play_pause"`, `"next_track"`, `"prev_track"`, `"volume_up"`, `"volume_down"`, `"mute_toggle"`, `"brightness_up"`, `"brightness_down"`

---

### `screenshot`
Takes a screenshot of the target machine's current screen. No parameters. Returns image as base64. Use this to verify the result of keyboard/mouse actions.

---

### `read_serial`
Reads buffered data that the ToothPaste firmware received on its USB CDC serial port and echoed back over BLE. Use this to verify serial communication with the device.

**Parameters:**
- `clear` (boolean, optional, default `true`) — whether to clear the buffer after reading

**Returns:**
```json
{ "lines": ["chunk1", "rest of line\n"], "count": 2 }
```

**BLE MTU chunking:** The firmware sends at most 63 bytes per BLE notification. A single serial line longer than 63 chars arrives as multiple consecutive entries in `lines`. The final chunk of each line ends with `\n`. To reconstruct full lines, concatenate consecutive entries until you see one ending with `\n`.

Example — 80-char message received as 2 chunks:
```json
["This message is deliberately longer than sixty-four characters t", "o test chunking\n"]
```
Full line: `"This message is deliberately longer than sixty-four characters to test chunking"`

**BLE lag:** `read_serial` may return empty if called immediately after sending. Retry once — BLE notify can lag 100–500ms.

---

## Finding the ToothPaste COM port

The ToothPaste device identifies itself over USB with:
- **VID**: `0xCAFE`
- **PID**: `0x0001`
- **Product string**: `"ToothPaste Receiver"`

To find its COM port on the target Windows machine, run this in a terminal:
```powershell
Get-WMIObject Win32_PnPEntity |
  Where-Object { $_.Name -match 'COM\d+' } |
  Where-Object { $_.DeviceID -match 'VID_CAFE&PID_0001' } |
  ForEach-Object { [regex]::Match($_.Name, 'COM\d+').Value }
```

If that returns nothing (driver not matched), fall back to product string:
```powershell
Get-WMIObject Win32_PnPEntity |
  Where-Object { $_.Name -match 'COM\d+' } |
  Where-Object { $_.Name -match 'ToothPaste|CP210|CH34|USB Serial' } |
  ForEach-Object { [regex]::Match($_.Name, 'COM\d+').Value }
```

**In practice, COM7 is the typical port in this setup.**

---

## Step-by-step patterns

### Pattern 1 — Open Windows Terminal and run a PowerShell command

Execute these tool calls in order. Do not skip steps.

```
1. press_key  →  key: "Meta+r"
2. type_text  →  text: "wt",  slowMode: 3
3. press_key  →  key: "Enter"
4. type_text  →  text: "<your powershell command here>",  slowMode: 5
5. press_key  →  key: "Enter"
```

Wait for Windows Terminal to open (it loads in ~1–2 seconds) before typing the command. If the target already has a terminal open, skip steps 1–3 and type directly.

### Pattern 2 — Send a string to the ToothPaste serial port and read it back

First find the COM port using the VID/PID query from the "Finding the ToothPaste COM port" section above. Then send:

```powershell
$p = (Get-WMIObject Win32_PnPEntity | Where-Object { $_.Name -match 'COM\d+' } | Where-Object { $_.DeviceID -match 'VID_CAFE&PID_0001' } | ForEach-Object { [regex]::Match($_.Name, 'COM\d+').Value })[0]
$s = New-Object System.IO.Ports.SerialPort($p, 115200); $s.Open(); $s.WriteLine("Hello from MCP"); $s.Close(); Write-Host "Sent to $p"
```

Then call `read_serial` to verify the firmware echoed it back over BLE. If `lines` is empty, retry once — BLE notify lags.

### Pattern 3 — Verify what happened on screen

After any keyboard/mouse action, call `screenshot` to see the current state of the target machine's display.

### Pattern 4 — Drawing with mouse_move

Since movement is relative, compute each delta from the previous point. For a circle of radius R centered at (cx, cy):
- For each angle θ from 0° to 360° in N steps, compute point (cx + R·cosθ, cy + R·sinθ)
- Send the **difference** between consecutive points as (x, y) to `mouse_move`
- First step: move from current position to (cx + R, cy) — you may need to estimate where the cursor is

---

## Error handling

| Symptom | Cause | Fix |
|---------|-------|-----|
| Tool returns `{ "type": "error" }` | Device disconnected | Call `get_status`, tell user to reconnect in the Electron app |
| `type_text` produces garbled/missing chars | `slowMode` too low | Retry with `slowMode: 5` |
| `press_key` does nothing | Wrong key name (e.g. `"Return"`) | Check the key name table above — use `"Enter"` not `"Return"` |
| Win+R only sends `r`, ignores Windows key | Used `"Super+r"` instead of `"Meta+r"` | `"Super"` silently drops as a modifier — **always use `"Meta"` for the Windows key in combos** |
| `read_serial` returns empty | BLE notify lag | Retry immediately — the data arrives within 500ms |
| `get_status` returns `ready: false` | Not authenticated | User must complete pairing in the Electron app UI |
| Command times out (30s) | BLE operation stalled | Call `get_status`, consider retrying once |
