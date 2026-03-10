import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { initMCPServer } from './mcp/index.js';
import { connectionStatusMap } from './types.js';

// Core library imports (runs in main process without React/Web-BLE)
// NativeBLEAdapter uses @stoprocent/noble (WinRT on Windows 10+, CoreBluetooth
// on macOS, BlueZ on Linux) — no Web Bluetooth / renderer dependency.
import { 
  BLEManager, 
  SessionManager, 
  PacketHandler, 
} from '../core/index.js';
// NativeBLEAdapter is imported directly (not via core/index.js) to prevent
// the renderer bundle from pulling in Node-only code (createRequire, noble).
import { NativeBLEAdapter } from '../core/adapters/noble.js';
import { create, toBinary, fromBinary } from '@bufbuild/protobuf';
import * as ToothPacketPB from '../web/src/services/packetService/toothpacket/toothpacket_pb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CORE BLE LIBRARY (Main Process)
// ============================================================================
// This runs independently of the renderer, allowing MCP and daemon mode

// Storage adapter for main process (using Node.js storage)
import fs from 'fs';
import os from 'os';

class MainProcessStorageAdapter {
  constructor() {
    this.storageDir = path.join(os.homedir(), '.toothpaste', 'keys');
    // Ensure directory exists
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  // Sanitize device ID for use as a filename component (colons invalid on Windows).
  _safeId(deviceId) {
    return deviceId.replace(/[:\\/]/g, '-');
  }

  async save(deviceId, key, value) {
    const filePath = path.join(this.storageDir, `${this._safeId(deviceId)}_${key}.txt`);
    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, value, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async load(deviceId, key) {
    const filePath = path.join(this.storageDir, `${this._safeId(deviceId)}_${key}.txt`);
    return new Promise((resolve) => {
      fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) resolve(null);
        else resolve(data);
      });
    });
  }

  async exists(deviceId, key) {
    const filePath = path.join(this.storageDir, `${this._safeId(deviceId)}_${key}.txt`);
    return new Promise((resolve) => {
      fs.access(filePath, fs.constants.F_OK, (err) => {
        resolve(!err);
      });
    });
  }
}

// Initialize core BLE library
let bleManager = null;

function initializeCoreBLELibrary() {
  if (bleManager) return bleManager;

  const adapter = new NativeBLEAdapter();
  const storageAdapter = new MainProcessStorageAdapter();
  const sessionManager = new SessionManager(storageAdapter);
  const packetHandler = new PacketHandler(ToothPacketPB, { create, toBinary, fromBinary });

  bleManager = new BLEManager(adapter, sessionManager, packetHandler, {
    serviceUUID: '19b10000-e8f2-537e-4f6c-d104768a1214',
    packetCharacteristicUUID: '6856e119-2c7b-455a-bf42-cf7ddd2c5907',
    hidSemaphoreCharacteristicUUID: '6856e119-2c7b-455a-bf42-cf7ddd2c5908',
    macAddressCharacteristicUUID: '19b10002-e8f2-537e-4f6c-d104768a1214',
    supportedFirmwareVersions: ['0.9.0^'],
  });

  // Forward BLE events to renderer if window is open
  bleManager.on('status', (statusInfo) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('ble:status', statusInfo);
    }
  });

  bleManager.on('device', (deviceInfo) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('ble:device', deviceInfo);
    }
  });

  bleManager.on('disconnect', (info) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('ble:disconnect', info);
    }
  });

  bleManager.on('serialData', (data) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('device:serialData', data);
    }
    // Buffer for MCP read_serial tool
    _serialBuffer.push(data);
  });

  console.log('[Main] Core BLE library initialized');
  return bleManager;
}

// Track MCP HTTP server state
let mcpHttpServer = null;
let mcpEnabled = false;

// Serial data buffer for MCP read_serial tool
const _serialBuffer = [];

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

// ============================================================================
// IPC LAYER FOR CORE BLE LIBRARY
// ============================================================================
// The MCP server calls this to execute commands on the core BLE library

async function coreBLEDispatch(tool, params) {
  const manager = initializeCoreBLELibrary();

  switch (tool) {
    case 'typeText':
      return await manager.sendKeyboardString(params.text);
    
    case 'pressKey':
      return await manager.sendKeyCode(params.key, params.slowMode || 0);
    
    case 'mouseMove':
      return await manager.sendMouseCommand(params.x, params.y);
    
    case 'mouseClick': {
      const button = params.button || 'left';
      return await manager.sendMouseCommand(0, 0, { 
        leftClick: button === 'left',
        rightClick: button === 'right'
      });
    }
    
    case 'mouseScroll':
      return await manager.sendMouseCommand(0, 0, { 
        scrollDelta: params.delta 
      });
    
    case 'mediaControl':
      const controlCodes = {
        'play_pause': 0xCD,
        'next_track': 0xB5,
        'prev_track': 0xB6,
        'volume_up': 0xE9,
        'volume_down': 0xEA,
        'mute_toggle': 0xE2,
        'brightness_up': 0xF8,
        'brightness_down': 0xF7,
      };
      const code = controlCodes[params.action];
      if (!code) throw new Error(`Unknown media control: ${params.action}`);
      return await manager.sendMediaControl(code);
    
    case 'connect': {
      // Clean up any stale peripheral — covers both silent drops and "Already connected" state
      if (manager.bleAdapter._currentPeripheral) {
        try { await manager.bleAdapter.disconnectDevice({ _peripheral: manager.bleAdapter._currentPeripheral }); } catch (_) {}
        manager.bleAdapter._currentPeripheral = null;
        manager.bleAdapter._connected = false;
      }
      // Reset manager state in case a previous connection wasn't cleaned up
      manager.connected = false;
      manager.authenticated = false;
      manager._pairingInProgress = false;

      await manager.connect({
        onDisconnect: () => {
          console.log('[Main] BLE device disconnected');
          // State is already cleared by BLEManager's disconnect handler;
          // nothing extra needed — next connect() call will re-scan cleanly.
        }
      });
      // If BLE link is up but not yet authenticated, try to migrate keys
      // from the renderer's encrypted storage (populated by a previous UI pairing).
      if (manager.status === 2 /* CONNECTED */ && manager.deviceMAC && mainWindow) {
        const keys = await _requestKeysFromRenderer(manager.deviceMAC);
        if (keys?.publicKey && keys?.secret) {
          const storage = manager.sessionManager.storageAdapter;
          await storage.save(manager.deviceMAC, 'SelfPublicKey', keys.publicKey);
          await storage.save(manager.deviceMAC, 'SharedSecret', keys.secret);
          console.log('[Main] Keys migrated from renderer — attempting pairing');
          try {
            await manager.pair();
          } catch (err) {
            if (err.message !== 'NO_KEYS') {
              console.warn('[Main] Pairing after key migration failed:', err.message);
            }
          }
        }
      }
      return {
        status: 'connecting',
        message: 'Scanning for ToothPaste device…',
      };
    }

    case 'disconnect':
      if (manager.device) {
        await manager.bleAdapter.disconnectDevice(manager.device);
      }
      return { status: 'disconnected' };

    case 'getStatus': {
      const statusLabel =
        manager.status === 1 ? 'ready' :
        manager.status === 2 ? 'connected' :
        manager.status === 4 ? 'scanning' : 'disconnected';
      return {
        status: statusLabel,
        statusCode: manager.status,
        ready: manager.status === 1,
        connected: manager.connected,
        deviceName: manager.device?.name || null,
        firmwareVersion: manager.firmwareVersion || null,
      };
    }

    case 'screenshot':
      // Note: screenshot requires either renderer or a native layer
      // For now, return a placeholder
      throw new Error('screenshot not supported in daemon mode');
    
    case 'getSerialData': {
      const lines = [..._serialBuffer];
      if (params?.clear !== false) _serialBuffer.length = 0;
      return { lines, count: lines.length };
    }
    
    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}

// ============================================================================
// LEGACY IPC DISPATCH (for renderer if it wants to use BLE directly)
// ============================================================================
// Falls back to core library dispatch if renderer isn't available

async function ipcDispatch(tool, params) {
  // Always use core library now
  return await coreBLEDispatch(tool, params);
}

/**
 * Request paired keys from the renderer process (if the window is open and unlocked).
 * Sends 'ble:requestKeys' to renderer, waits up to 5 s for 'ble:keys' reply.
 * Returns { publicKey, secret } in base64, or null if unavailable.
 */
function _requestKeysFromRenderer(mac) {
  return new Promise((resolve) => {
    if (!mainWindow) { resolve(null); return; }
    const timer = setTimeout(() => {
      ipcMain.removeAllListeners('ble:keys');
      console.warn('[Main] Renderer did not respond with BLE keys within 5 s');
      resolve(null);
    }, 5000);
    ipcMain.once('ble:keys', (_, data) => {
      clearTimeout(timer);
      resolve(data);
    });
    mainWindow.webContents.send('ble:requestKeys', { mac });
  });
}

/**
 * Handle MCP enable/disable toggle (legacy, kept for compatibility)
 */
ipcMain.on('mcp:setEnabled', async (event, enabled) => {
  // MCP server is always enabled now, decoupled from renderer
  // Just acknowledge to renderer
  event.reply('mcp:enabled', true);
});

/**
 * Forward device selection from Electron picker to BLE manager
 */
ipcMain.on('ble:selectDevice', (_, deviceId) => {
  // This would require extending WebBLEAdapter to support manual device selection
  // For now, this is handled by the renderer calling navigator.bluetooth directly
  console.log('[IPC] Device selected:', deviceId);
});

ipcMain.on('ble:cancelScan', () => {
  // Device scan cancellation
  console.log('[IPC] Device scan cancelled');
});

// ============================================================================
// ELECTRON APP LIFECYCLE
// ============================================================================

app.on('ready', async () => {
  // Initialize core BLE library (independent of renderer)
  initializeCoreBLELibrary();

  // Create window (optional, can be hidden/tray mode)
  createWindow();

  // Start MCP HTTP server on localhost
  // Can now run independently of renderer being open
  try {
    mcpHttpServer = await initMCPServer(coreBLEDispatch);
    mcpEnabled = true;
    console.log('[MCP] MCP server started and ready for daemon/tray mode');
  } catch (err) {
    console.error('[MCP] Failed to start MCP HTTP server:', err);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Don't quit if MCP server is running (daemon mode)
    if (mcpEnabled && mcpHttpServer) {
      console.log('[Main] Window closed but MCP server is still running (daemon mode)');
      return;
    }
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
