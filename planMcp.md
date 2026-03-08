# Plan: MCP Server for ToothPaste

## Goal
Expose ToothPaste device capabilities (BLE keyboard/mouse/HID) as MCP tools so AI agents (Claude Desktop, Cursor, etc.) can autonomously control the target system via the ToothPaste hardware.

---

## Architecture

The MCP server runs inside an Electron app. Electron's renderer process is Chromium, so `navigator.bluetooth` works natively — no proxy, no browser tab dependency, no sidecar process. The MCP server lives in the main (Node.js) process and communicates with the renderer via Electron IPC.

```
AI Agent → MCP Server (Electron main) → ipcMain/ipcRenderer → Web Bluetooth → BLE → ToothPaste Device → Target Machine
```

```
┌─────────────────────────────────────────────────────┐
│                  Electron App                        │
│  ┌──────────────────────┐  ┌──────────────────────┐ │
│  │   Main Process       │  │  Renderer Process    │ │
│  │   (Node.js)          │  │  (Chromium)          │ │
│  │                      │  │                      │ │
│  │  MCP Server          │◄─►  React App           │ │
│  │  (stdio transport)   │IPC│  BLEContext          │ │
│  │  ipcMain dispatch    │  │  keyboardHandler     │ │
│  └──────────────────────┘  │  mouseHandler        │ │
│                             └──────────┬───────────┘ │
└──────────────────────────────────────── ┼────────────┘
                                          │ Web Bluetooth
                                     ┌────▼─────┐
                                     │ ToothPaste│
                                     │  (ESP32)  │
                                     └──────────┘
```

**All existing `web/src/` code ports to Electron renderer with zero changes:**

| API | Used in | Works in Electron |
|---|---|---|
| `navigator.bluetooth` | `BLEContext.jsx` | ✅ (needs `select-bluetooth-device` handler in main) |
| `crypto.subtle` | `ECDHContext.jsx`, `EncryptedStorage.js` | ✅ identical |
| `IndexedDB` | `ECDHContext.jsx` | ✅ identical |
| `localStorage` | `EncryptedStorage.js` | ✅ identical |
| React + JSX | all components | ✅ via `electron-vite` |
| `@bufbuild/protobuf` | `BLEContext.jsx` | ✅ pure JS |

---

## Repo & Sync Strategy

Same repo (`MCPerhaps` branch), `electron/` at root. `web/src/` is the single source of truth for all UI — shared by both builds via `electron-vite`'s renderer `root` config pointing at `../web/src`. One edit to a component, both builds reflect it. Nothing is duplicated.

**What stays web-only:** `web/public/`, `web/index.html`, `web/vite.config.js`, GitHub Actions deploy workflow.  
**What is shared:** Everything under `web/src/`.  
**What is Electron-only:** `electron/` — `main.js`, `preload.js`, `mcp/`, `electron.vite.config.js`.  
**Only addition to `web/src/`:** `useMCPBridge.js` — a no-op in browser mode (guarded by `window.toothpasteMCP` check).

---

## Components to Build

### 1. `electron/main.js` — Electron Main Process

- App window creation and lifecycle; always shows the full UI (identical to the web app)
- Runs persistently in the background via system tray when the window is closed
- `select-bluetooth-device` event handler (auto-selects paired ToothPaste device or shows picker)
- `ipcMain` handler: receives MCP tool dispatches, forwards to renderer via `webContents.send('mcp:command', cmd)`, awaits response via `ipcMain.once('mcp:result', ...)`
- MCP server is only started when the user enables **MCP Mode** in the app's settings — `ipcMain` receives a `mcp:setEnabled` message from the renderer to start/stop it on demand

### 2. `electron/preload.js` — Context Bridge

```javascript
contextBridge.exposeInMainWorld('toothpasteMCP', {
  onCommand: (cb) => ipcRenderer.on('mcp:command', (_, cmd) => cb(cmd)),
  sendResult: (result) => ipcRenderer.send('mcp:result', result),
});
```

### 3. `web/src/services/mcpBridge/useMCPBridge.js` — Renderer IPC Hook

- Registers `window.toothpasteMCP.onCommand(handler)` on mount
- Dispatches commands to `keyboardHandler`, `mouseHandler`
- Responds via `window.toothpasteMCP.sendResult({ id, success, error? })`
- Guards: only processes when `connectionStatus === ConnectionStatus.ready`
- Sends `mcp:setEnabled` to main when MCP Mode toggle changes in settings
- Silent no-op when `window.toothpasteMCP` is undefined (browser dev mode)

### 4. `electron/mcp/` — MCP Server

**Stack:** `@modelcontextprotocol/sdk`, stdio transport, runs in Electron main process.

`index.js` — Creates `McpServer`, registers tools, wires to IPC dispatch  
`tools/` — One file per tool, each exports `{ name, description, inputSchema, execute(params, ipcDispatch) }`

**Exposed tools:**

| Tool | Description | Params |
|---|---|---|
| `type_text` | Type a string on the target machine | `text: string`, `slowMode?: int` (ms delay between packets) |
| `press_key` | Press a key or shortcut | `key: string`, `modifiers?: string[]`, `slowMode?: int` |
| `mouse_move` | Move mouse relative | `x: int`, `y: int` |
| `mouse_click` | Click mouse buttons | `left?: bool`, `right?: bool` |
| `mouse_scroll` | Scroll wheel | `delta: int` |
| `media_control` | Media/system control | `action: enum` — play_pause, volume_up, volume_down, mute, next, previous, brightness_up, brightness_down |
| `get_status` | Returns device connection state | — |
| `screenshot` | Capture the target machine screen | — | ⏳ pending implementation |

> `run_script` and `run_duckyscript` are omitted — an agent constructs and sends payloads live using the above primitives.
>
> `screenshot` is planned but requires implementation on both the Electron side (`desktopCapturer`) and potentially firmware side; tracked as a future task.

---

## Security

- IPC is process-internal — zero network exposure
- `contextBridge` enforces renderer isolation — renderer cannot access Node APIs
- Commands are rejected if `connectionStatus !== ConnectionStatus.ready`
- MCP server only runs when explicitly enabled by the user in settings — off by default
- Rate limiting in `ipcMain` handler to prevent runaway agent loops

---

## File Structure

```
toothpaste/
├── electron/
│   ├── package.json
│   ├── electron.vite.config.js      ← renderer.root → ../web/src
│   ├── main.js
│   ├── preload.js
│   └── mcp/
│       ├── index.js
│       └── tools/
│           ├── typeText.js
│           ├── pressKey.js
│           ├── mouse.js
│           ├── mediaControl.js
│           ├── getStatus.js
│           └── screenshot.js        ← stub, pending implementation
└── web/
    └── src/
        └── services/
            └── mcpBridge/
                └── useMCPBridge.js
```

---

## Claude Desktop Integration

```json
{
  "mcpServers": {
    "toothpaste": {
      "command": "C:\\path\\to\\ToothPaste.exe"
    }
  }
}
```

The app always presents its full UI. MCP mode is enabled in settings, which starts the stdio server. Claude Desktop (or any MCP host) can then be pointed at the exe — the user pairs the device in the UI as normal, and the agent has full keyboard/mouse/HID control.

---

## Build Steps

1. Scaffold `electron/` with `electron-vite`, point renderer `root` at `../web/src`
2. Write `electron/main.js` and `electron/preload.js`
3. Add `useMCPBridge.js` to `web/src/services/mcpBridge/` and mount it in `App.jsx`
4. Implement `electron/mcp/index.js` and tool files
5. Test locally with `electron-vite dev` from `electron/`
6. `web/` build and GitHub Pages deploy workflow remain untouched

