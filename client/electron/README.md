# ToothPaste Electron + MCP Server

This directory contains the Electron application wrapper for ToothPaste, which exposes BLE device control capabilities as an MCP (Model Context Protocol) server.

## Architecture

The app runs the complete ToothPaste React UI in the Electron renderer process and provides MCP tools via stdio transport in the main process. This allows AI agents (Claude Desktop, Cursor, etc.) to autonomously control the target system via ToothPaste hardware.

```
AI Agent (stdin/stdout) → MCP Server (Node main) ↔ IPC ↔ React UI (renderer) → Web Bluetooth → ToothPaste → Target
```

## Key Features

- **Full UI in Electron**: The entire web app UI runs unchanged in the renderer, sharing code with the web version
- **MCP Tools**: Keyboard input, mouse control, media commands, and more
- **Serial Output Integration**: Device debug output is captured and returned as tool results
- **IPC-based Dispatch**: Commands securely flow from MCP → main process → renderer → BLE

## Setup

### Prerequisites

- Node.js 18+
- Electron 30+ (installed as dev dependency)

### Installation

```bash
cd e:\VSCode\ClipBoard\ToothPaste\electron
npm install
```

Note: If you encounter issues, also install dependencies in the web directory:
```bash
cd ../web
npm install
```

### Development

```bash
cd electron
npm run dev
```

This starts the Electron app in dev mode with:
- Hot reload of the renderer (via electron-vite)
- DevTools automatically opened
- MCP server stdio transport on stdout/stderr

**Enable MCP Mode**: In the app's Settings, toggle "MCP Mode" to start the stdio server. Once enabled, the app can be used as an MCP server.

### Production Build

```bash
npm run build
```

Outputs to `electron/out/` with:
- `main/` - Compiled main process
- `renderer/` - Packaged React app
- `preload/` - Compiled preload script

### Running as MCP Server

Once built, the executable can be configured in Claude Desktop or other MCP hosts:

**`claude_desktop_config.json`:**
```json
{
  "mcpServers": {
    "toothpaste": {
      "command": "C:\\path\\to\\ToothPaste.exe"
    }
  }
}
```

On startup:
1. User sees the full ToothPaste UI in the Electron window
2. User pairs/connects the BLE device as normal
3. MCP server listens on stdio, waiting for commands
4. Enabling MCP Mode activates the stdio server
5. AI agents can now call tools to control the device

## File Structure

```
electron/
├── package.json                 - Dependencies (MCP SDK, Electron, etc.)
├── electron.vite.config.js      - Build config (renderer uses ../web/src)
├── main.js                      - Electron main process, IPC handlers, MCP dispatch
├── preload.js                   - Context bridge for secure IPC
└── mcp/
    ├── index.js                 - MCP server setup and tool registration
    └── tools/
        ├── typeText.js          - Type text input
        ├── pressKey.js          - Press keys/shortcuts
        ├── mouse.js             - Mouse movement, clicks, scrolling
        ├── mediaControl.js      - Media playback, volume, brightness
        ├── getStatus.js         - Device connection status
        └── screenshot.js        - Stub for future implementation
```

## MCP Tools

All tools are available when the device is connected and ready. Each tool returns structured JSON results.

### 1. `type_text`
Type a string on the target machine.

**Params:**
- `text` (string, required): Text to type
- `slowMode` (int, optional): Delay in ms between packets (0-1000)

**Example:**
```json
{
  "tool": "type_text",
  "params": {
    "text": "Hello, World!",
    "slowMode": 50
  }
}
```

### 2. `press_key`
Press a key or key combination.

**Params:**
- `key` (string, required): Key name or combination (e.g., "Return", "ctrl+a", "alt+tab")
- `slowMode` (int, optional): Delay in ms

**Supported Keys:**
- Single: "Return", "Escape", "Tab", "Backspace", "Delete", " " (space)
- Arrow keys: "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"
- Modifiers: "ctrl+", "shift+", "alt+", "meta+" (Windows/Cmd key)

**Example:**
```json
{
  "tool": "press_key",
  "params": {
    "key": "ctrl+s",
    "slowMode": 0
  }
}
```

### 3. `mouse_control`
Control mouse movement, clicks, and scrolling.

**Params:**
- `action` (string, required): "move", "click", or "scroll"
- `x` (int): X coordinate/offset (for move)
- `y` (int): Y coordinate/offset (for move)
- `button` (string): "left", "right", or "middle" (for click, default: left)
- `delta` (int): Scroll distance in lines, positive=down (for scroll)

**Examples:**
```json
{
  "tool": "mouse_control",
  "params": {
    "action": "click",
    "button": "left"
  }
}
```

```json
{
  "tool": "mouse_control",
  "params": {
    "action": "scroll",
    "delta": 3
  }
}
```

### 4. `media_control`
Control media playback and system settings.

**Params:**
- `action` (string, required): One of:
  - `play_pause`
  - `next_track`
  - `prev_track`
  - `volume_up`
  - `volume_down`
  - `mute_toggle`
  - `brightness_up`
  - `brightness_down`

**Example:**
```json
{
  "tool": "media_control",
  "params": {
    "action": "volume_up"
  }
}
```

### 5. `get_status`
Get the device connection status.

**Params:** None

**Response:**
```json
{
  "type": "success",
  "status": "ready",
  "connected": true,
  "deviceName": "ToothPaste (ABC123)",
  "firmwareVersion": "0.9.0"
}
```

### 6. `screenshot` (Stub)
Placeholder for future screen capture feature.

## Serial Data Integration

Device output (from `SERIAL_DATA` responses) is automatically captured and included in command results:

**Command input:**
```json
{
  "tool": "type_text",
  "params": {
    "text": "ls"
  }
}
```

**Tool result (with device output):**
```json
{
  "type": "success",
  "message": "Typed \"ls\"",
  "output": "Typed: ls\n[Device Output]\nDirectory listing: ...",
  "slowMode": 0
}
```

The `[Device Output]` section contains any debug strings the device sent back during command execution.

## How MCP Commands Flow

1. **MCP Client** (Claude, Cursor, etc.) sends a tool call via stdio
2. **MCP Server** (in Electron main) receives the tool request
3. **IPC Dispatch** → sends `mcp:command` event to renderer, waits for `mcp:result`
4. **Renderer** (React, BLEContext) executes the command using BLE context handlers
5. **BLE Device** receives HID packets, controls target machine
6. **Serial Data** from device is captured in the renderer
7. **IPC Result** → renderer sends accumulated output back to main process
8. **MCP Response** → server returns structured result to client

## Security

- **Context Isolation**: Renderer cannot access Node APIs
- **IPC Firewall**: Only specific channels are exposed via preload bridge
- **Command Validation**: All commands checked for valid connection status
- **Rate Limiting**: Prevent runaway agent loops (optional, can be added)
- **Process-Internal**: No network exposure; all communication is local IPC

## Development Tips

### Debugging MCP Commands

In the Electron app, enable DevTools (already enabled in dev mode) to see:
- React component behavior
- BLE context state (device, status, etc.)
- IPC message flow (logged to console)
- Command execution and serialData capture

### Testing MCP Server

You can test the MCP stdio server without Claude Desktop:

```bash
# Build first
npm run build

# Then manually test stdio transport (on Windows, needs shell redirection)
.\out\main\main.js
# Type in JSON-RPC requests to test
```

### Extending with New Tools

1. Create a new file in `electron/mcp/tools/myTool.js`:
   ```javascript
   export const myTool = {
     name: 'my_tool',
     description: 'Does something',
     inputSchema: { /* JSON schema */ },
     execute: async (params, ipcDispatch) => {
       // Dispatch to renderer via ipcDispatch('toolName', params)
       // Return structured result
     }
   };
   ```

2. Import and register in `electron/mcp/index.js`:
   ```javascript
   import { myTool } from './tools/myTool.js';
   // Add to tools array
   ```

3. Add corresponding handler in `web/src/context/BLEContext.jsx` or use existing helpers.

## Notes

- **Shared Code**: `web/src/` is the single source of truth. Both web and Electron builds use the same UI code via `electron-vite`'s renderer root config.
- **No Duplication**: Only `electron/` is electron-specific. Everything else (CSS, components, contexts) is shared.
- **Development Workflow**: Changes to `web/src/` automatically reflect in both builds during dev.

## Troubleshooting

### "Device not found" or connection issues
- Check that the ToothPaste device is powered on and advertising
- Try reconnecting the device in the UI
- Check browser console in DevTools for more details

### MCP server not responding
- Ensure MCP Mode is enabled in the app settings
- Check that the device status shows "ready" in the UI
- Review the MCP tools list (should see type_text, press_key, etc.)

### IPC timeouts
- Check renderer console for errors in command execution
- Verify device is still connected
- Try restarting the app

### Build errors
- Delete `node_modules` and `package-lock.json`, then run `npm install` again
- Ensure Node 18+ is installed
- Check that both `electron/` and `web/` have their dependencies installed

## Future Enhancements

- [ ] Screenshot capture (device + screen integration)
- [ ] Profile-based command sequences
- [ ] Rate limiting for MCP commands
- [ ] Enhanced logging/telemetry
- [ ] Multi-device support
- [ ] Over-the-air firmware updates via MCP
