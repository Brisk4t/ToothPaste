import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { initMCPServer } from './mcp/index.js';
import { connectionStatusMap } from './types.js';

// Core library imports (runs in main process without React/Web-BLE)
import { 
  BLEManager, 
  SessionManager, 
  PacketHandler, 
  WebBLEAdapter,
} from '../core/index.js';
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

  async save(deviceId, key, value) {
    const filePath = path.join(this.storageDir, `${deviceId}_${key}.txt`);
    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, value, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async load(deviceId, key) {
    const filePath = path.join(this.storageDir, `${deviceId}_${key}.txt`);
    return new Promise((resolve) => {
      fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) resolve(null);
        else resolve(data);
      });
    });
  }

  async exists(deviceId, key) {
    const filePath = path.join(this.storageDir, `${deviceId}_${key}.txt`);
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

  const adapter = new WebBLEAdapter();
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
  });

  console.log('[Main] Core BLE library initialized');
  return bleManager;
}

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
    
    case 'getStatus':
      return {
        status: 'ready',
        statusCode: manager.getStatus(),
        ready: manager.isConnected(),
        connected: manager.isConnected(),
        deviceName: manager.getDevice()?.name || 'Unknown',
      };
    
    case 'screenshot':
      // Note: screenshot requires either renderer or a native layer
      // For now, return a placeholder
      throw new Error('screenshot not supported in daemon mode');
    
    case 'readSerial':
      // Serial reading requires tracking from ResponseListener
      // For now, return empty
      return { lines: [], count: 0 };
    
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
