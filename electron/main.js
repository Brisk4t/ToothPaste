import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { initMCPServer } from './mcp/index.js';
import { connectionStatusMap } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Track MCP HTTP server state
let mcpHttpServer = null;
let mcpEnabled = false;

// Track the last command ID for response mapping
const pendingCommands = new Map();

let mainWindow = null;

function createWindow() {
  // Must be set before the window loads so requestDevice() isn't denied
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'bluetooth') {
      callback(true);
    } else {
      callback(false);
    }
  });

  mainWindow = new BrowserWindow({
    width: 1216,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      sandbox: false
    }
  });

  // Load from electron-vite dev server or packaged app
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle BLE device selection — Electron requires this or it auto-cancels requestDevice()
  let bluetoothSelectCallback = null;
  let scanTimeout = null;

  const cancelScan = () => {
    if (scanTimeout) { clearTimeout(scanTimeout); scanTimeout = null; }
    if (bluetoothSelectCallback) {
      bluetoothSelectCallback('');
      bluetoothSelectCallback = null;
    }
    mainWindow?.webContents.send('ble:scanStatus', 'cancelled');
  };

  mainWindow.webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault();
    bluetoothSelectCallback = callback;

    // Send the current device list to the renderer for display
    mainWindow?.webContents.send('ble:deviceList', deviceList.map(d => ({
      deviceId: d.deviceId,
      deviceName: d.deviceName || 'Unknown Device'
    })));
    mainWindow?.webContents.send('ble:scanStatus', 'scanning');

    // Start/reset timeout
    if (scanTimeout) clearTimeout(scanTimeout);
    scanTimeout = setTimeout(() => {
      scanTimeout = null;
      if (bluetoothSelectCallback) {
        bluetoothSelectCallback('');
        bluetoothSelectCallback = null;
        mainWindow?.webContents.send('ble:scanStatus', 'timeout');
      }
    }, 15000);
  });

  // Renderer selected a device from the picker
  ipcMain.on('ble:selectDevice', (_, deviceId) => {
    if (scanTimeout) { clearTimeout(scanTimeout); scanTimeout = null; }
    if (bluetoothSelectCallback) {
      bluetoothSelectCallback(deviceId);
      bluetoothSelectCallback = null;
    }
  });

  ipcMain.on('ble:cancelScan', () => cancelScan());

  // Register Bluetooth pairing handler once the session is available
  session.defaultSession.setBluetoothPairingHandler((details, callback) => {
    const { deviceId, deviceName, pairing } = details;
    if (deviceName && deviceName.toLowerCase().includes('toothpaste')) {
      console.log(`[BLE] Auto-approving ToothPaste device: ${deviceName}`);
      callback({ selection: deviceId });
    } else if (pairing === 'provide-pin') {
      console.log(`[BLE] Device ${deviceName} requires PIN - showing UI`);
      mainWindow?.webContents.send('device:pinRequired', { deviceId, deviceName });
      callback({});
    } else {
      callback({ selection: deviceId });
    }
  });
}

// ============================================================================
// IPC HANDLERS FOR MCP COMMANDS
// ============================================================================

/**
 * Handle MCP command execution from the renderer
 * Dispatches the command to the renderer and waits for result
 */
async function ipcDispatch(tool, params) {
  if (!mainWindow) {
    throw new Error('Renderer window not available');
  }

  const commandId = `cmd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingCommands.delete(commandId);
      reject(new Error(`Command ${commandId} timed out after 30s`));
    }, 30000);

    pendingCommands.set(commandId, { resolve, reject, timeout });

    // Send command to renderer
    mainWindow.webContents.send('mcp:command', {
      id: commandId,
      tool,
      params
    });
  });
}

/**
 * Receive result from renderer and resolve the promise
 */
ipcMain.on('mcp:result', (event, result) => {
  const { id, success, output, error } = result;
  const pending = pendingCommands.get(id);

  if (!pending) {
    console.warn(`[IPC] Received result for unknown command: ${id}`);
    return;
  }

  clearTimeout(pending.timeout);
  pendingCommands.delete(id);

  if (success) {
    pending.resolve({ output, success: true });
  } else {
    pending.reject(new Error(error || 'Command failed'));
  }
});

/**
 * Handle MCP enable/disable toggle from renderer settings UI
 */
ipcMain.on('mcp:setEnabled', async (event, enabled) => {
  try {
    if (enabled && !mcpHttpServer) {
      mcpHttpServer = await initMCPServer(ipcDispatch);
      mcpEnabled = true;
      console.log('[MCP] MCP server started');
    } else if (!enabled && mcpHttpServer) {
      mcpHttpServer.close();
      mcpHttpServer = null;
      mcpEnabled = false;
      console.log('[MCP] MCP server stopped');
    }
  } catch (error) {
    console.error('[MCP] Error toggling MCP server:', error);
    mcpHttpServer = null;
    mcpEnabled = false;
  }
});

/**
 * Forward serial data from device to renderer
 * Called by the renderer when it receives SERIAL_DATA from the device
 */
ipcMain.on('device:serialData', (event, data) => {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('device:serialData', data);
  }
});

// ============================================================================
// ELECTRON APP LIFECYCLE
// ============================================================================

app.on('ready', async () => {
  createWindow();

  // Always start the MCP HTTP server on localhost so VS Code Copilot
  // can connect without needing to spawn this process itself.
  try {
    mcpHttpServer = await initMCPServer(ipcDispatch);
    mcpEnabled = true;
  } catch (err) {
    console.error('[MCP] Failed to start MCP HTTP server:', err);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (mcpHttpServer) {
      mcpHttpServer.close();
      mcpHttpServer = null;
    }
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle any uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[Error] Uncaught exception:', error);
});
