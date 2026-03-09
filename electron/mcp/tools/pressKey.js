/**
 * Press Key Tool
 * Press a single key or key combination on the target machine
 */
export const pressKeyTool = {
  name: 'press_key',
  description: 'Press a key or key combination (e.g., "Return", "ctrl+c", "alt+tab")',
  inputSchema: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description: 'The key name or combination (e.g., "Return", "Escape", "ctrl+a", "shift+alt+Delete")'
      },
      slowMode: {
        type: 'integer',
        description: 'Optional delay in milliseconds between packets',
        minimum: 0,
        maximum: 1000
      }
    },
    required: ['key']
  },

  execute: async (params, ipcDispatch) => {
    const { key, slowMode } = params;

    try {
      const result = await ipcDispatch('pressKey', {
        key,
        slowMode: slowMode || 0
      });

      return {
        type: 'success',
        message: `Pressed key(s): ${key}`,
        output: result?.output || '',
        slowMode: slowMode || 0
      };
    } catch (error) {
      return {
        type: 'error',
        message: `Failed to press key: ${error.message}`,
        error: error.message
      };
    }
  }
};
