/**
 * Type Text Tool
 * Sends a string as keyboard input to the target machine
 */
export const typeTextTool = {
  name: 'type_text',
  description: 'Type a string on the target machine',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The text to type'
      },
      slowMode: {
        type: 'integer',
        description: 'Optional delay in milliseconds between packets (for reliable typing on slow systems)',
        minimum: 0,
        maximum: 1000
      }
    },
    required: ['text']
  },

  execute: async (params, ipcDispatch) => {
    const { text, slowMode } = params;

    try {
      const result = await ipcDispatch('typeText', {
        text,
        slowMode: slowMode || 0
      });

      return {
        type: 'success',
        message: `Typed "${text}"`,
        output: result?.output || '',
        slowMode: slowMode || 0
      };
    } catch (error) {
      return {
        type: 'error',
        message: `Failed to type text: ${error.message}`,
        error: error.message
      };
    }
  }
};
