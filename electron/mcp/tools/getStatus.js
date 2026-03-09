/**
 * Get Status Tool
 * Returns the connection status of the ToothPaste device
 */
export const getStatusTool = {
  name: 'get_status',
  description: 'Get the connection status of the ToothPaste device',
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  },

  execute: async (params, ipcDispatch) => {
    try {
      const result = await ipcDispatch('getStatus', {});
      // ipcDispatch returns { output: <JSON string>, success: true }
      const data = typeof result?.output === 'string' ? JSON.parse(result.output) : result;

      return {
        type: 'success',
        status: data?.status || 'unknown',
        statusCode: data?.statusCode ?? null,
        ready: data?.ready || false,
        connected: data?.connected || false,
        deviceName: data?.deviceName || null,
        firmwareVersion: data?.firmwareVersion || null
      };
    } catch (error) {
      return {
        type: 'error',
        message: `Failed to get status: ${error.message}`,
        error: error.message,
        connected: false
      };
    }
  }
};
