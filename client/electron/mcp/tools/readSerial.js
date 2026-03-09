/**
 * Read Serial Data Tool
 * Returns any SERIAL_DATA payloads buffered from the device since the last read.
 */
export const readSerialTool = {
  name: 'read_serial',
  description: 'Read buffered SERIAL_DATA responses from the ToothPaste device (data sent to its USB serial port is echoed back over BLE)',
  inputSchema: {
    type: 'object',
    properties: {
      clear: {
        type: 'boolean',
        description: 'Clear the buffer after reading (default: true)'
      }
    },
    required: []
  },

  execute: async (params, ipcDispatch) => {
    try {
      const result = await ipcDispatch('getSerialData', { clear: params?.clear !== false });
      const data = typeof result?.output === 'string' ? JSON.parse(result.output) : result;

      return {
        type: 'success',
        lines: data?.lines || [],
        count: data?.count || 0
      };
    } catch (error) {
      return {
        type: 'error',
        message: `Failed to read serial data: ${error.message}`,
        error: error.message
      };
    }
  }
};
