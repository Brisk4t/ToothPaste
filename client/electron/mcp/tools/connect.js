/**
 * Connect Tool — Trigger native BLE scan and connect to the ToothPaste device.
 * Uses NativeBLEAdapter (WinRT/CoreBluetooth/BlueZ) — no renderer required.
 */
export const connectTool = {
  name: 'connect',
  description:
    'Scan for and connect to the ToothPaste BLE device using the native OS BLE stack. ' +
    'Scans for up to 15 seconds. Also performs ECDH key exchange (pairing) automatically ' +
    'if the device has previously been paired. Check get_status after calling this.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  },

  execute: async (params, ipcDispatch) => {
    try {
      const result = await ipcDispatch('connect', {});
      return {
        type: 'success',
        message: result?.message || 'Connection initiated. Call get_status to monitor progress.',
      };
    } catch (error) {
      return {
        type: 'error',
        message: `Connect failed: ${error.message}`,
      };
    }
  }
};

/**
 * Disconnect Tool — Cleanly disconnect from the ToothPaste device.
 */
export const disconnectTool = {
  name: 'disconnect',
  description: 'Disconnect from the currently connected ToothPaste BLE device.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  },

  execute: async (params, ipcDispatch) => {
    try {
      await ipcDispatch('disconnect', {});
      return { type: 'success', message: 'Disconnected.' };
    } catch (error) {
      return {
        type: 'error',
        message: `Disconnect failed: ${error.message}`,
      };
    }
  }
};
