import { contextBridge, ipcRenderer } from 'electron';

// Expose serialData sending to the renderer for SERIAL_DATA forwarding
contextBridge.exposeInMainWorld('ipcRenderer', {
  send: (channel, data) => {
    if (['device:serialData'].includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  }
});

contextBridge.exposeInMainWorld('toothpasteBLE', {
  cancelScan: () => ipcRenderer.send('ble:cancelScan'),
  selectDevice: (deviceId) => ipcRenderer.send('ble:selectDevice', deviceId),
  onScanStatus: (callback) => {
    ipcRenderer.on('ble:scanStatus', (_, status) => callback(status));
  },
  onDeviceList: (callback) => {
    ipcRenderer.on('ble:deviceList', (_, devices) => callback(devices));
  },
  // Key bridge: main process requests paired keys from the renderer's
  // encrypted storage so they can be used in daemon/MCP mode.
  onRequestKeys: (callback) => {
    ipcRenderer.on('ble:requestKeys', (_, data) => callback(data));
  },
  sendKeys: (data) => {
    ipcRenderer.send('ble:keys', data);
  },
});

contextBridge.exposeInMainWorld('toothpasteMCP', {
  /**
   * Register a callback to handle MCP commands from the main process.
   * Replaces any previously registered handler so only one listener exists.
   * @param {Function} callback - Called with (command) containing { id, tool, params }
   */
  onCommand: (callback) => {
    ipcRenderer.removeAllListeners('mcp:command');
    ipcRenderer.on('mcp:command', (_, command) => {
      callback(command);
    });
  },

  /**
   * Send the result of an MCP command back to the main process
   * @param {Object} result - { id, success, output?, error? }
   */
  sendResult: (result) => {
    ipcRenderer.send('mcp:result', result);
  },

  /**
   * Enable/disable MCP server
   * @param {Boolean} enabled
   */
  setMCPEnabled: (enabled) => {
    ipcRenderer.send('mcp:setEnabled', enabled);
  },

  /**
   * Register callback for serial data from device
   * @param {Function} callback - Called with (data: Uint8Array)
   */
  onSerialData: (callback) => {
    ipcRenderer.removeAllListeners('device:serialData');
    ipcRenderer.on('device:serialData', (_, data) => {
      callback(data);
    });
  }
});
