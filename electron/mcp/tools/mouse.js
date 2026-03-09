/**
 * Mouse Tools
 * Three separate tools as per plan: mouse_move, mouse_click, mouse_scroll
 */

export const mouseMoveTool = {
  name: 'mouse_move',
  description: 'Move the mouse cursor by a relative offset',
  inputSchema: {
    type: 'object',
    properties: {
      x: { type: 'integer', description: 'Horizontal offset (positive = right)' },
      y: { type: 'integer', description: 'Vertical offset (positive = down)' }
    },
    required: ['x', 'y']
  },
  execute: async ({ x, y }, ipcDispatch) => {
    await ipcDispatch('mouseMove', { x, y });
    return { type: 'success', message: `Moved mouse by (${x}, ${y})` };
  }
};

export const mouseClickTool = {
  name: 'mouse_click',
  description: 'Click a mouse button',
  inputSchema: {
    type: 'object',
    properties: {
      button: {
        type: 'string',
        enum: ['left', 'right', 'middle'],
        description: 'Which button to click (default: left)'
      }
    },
    required: []
  },
  execute: async ({ button = 'left' }, ipcDispatch) => {
    await ipcDispatch('mouseClick', { button });
    return { type: 'success', message: `Clicked ${button} mouse button` };
  }
};

export const mouseScrollTool = {
  name: 'mouse_scroll',
  description: 'Scroll the mouse wheel',
  inputSchema: {
    type: 'object',
    properties: {
      delta: {
        type: 'integer',
        description: 'Scroll distance in lines (positive = down, negative = up)'
      }
    },
    required: ['delta']
  },
  execute: async ({ delta }, ipcDispatch) => {
    await ipcDispatch('mouseScroll', { delta });
    return { type: 'success', message: `Scrolled ${delta > 0 ? 'down' : 'up'} by ${Math.abs(delta)} lines` };
  }
};
