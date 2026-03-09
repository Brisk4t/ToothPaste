/**
 * Media Control Tool
 * Control media playback and system volume
 */
export const mediaControlTool = {
  name: 'media_control',
  description: 'Control media playback and system volume/brightness',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [
          'play_pause',
          'next_track',
          'prev_track',
          'volume_up',
          'volume_down',
          'mute_toggle',
          'brightness_up',
          'brightness_down'
        ],
        description: 'The media control action to perform'
      }
    },
    required: ['action']
  },

  execute: async (params, ipcDispatch) => {
    const { action } = params;

    try {
      const result = await ipcDispatch('mediaControl', {
        action
      });

      const actionLabels = {
        play_pause: 'Play/Pause',
        next_track: 'Next Track',
        prev_track: 'Previous Track',
        volume_up: 'Volume Up',
        volume_down: 'Volume Down',
        mute_toggle: 'Mute Toggle',
        brightness_up: 'Brightness Up',
        brightness_down: 'Brightness Down'
      };

      return {
        type: 'success',
        message: `${actionLabels[action] || action} executed`,
        output: result?.output || ''
      };
    } catch (error) {
      return {
        type: 'error',
        message: `Failed to execute media control: ${error.message}`,
        error: error.message
      };
    }
  }
};
