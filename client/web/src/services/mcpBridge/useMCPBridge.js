import { useEffect, useContext, useRef } from 'react';
import { useBLEContext, ConnectionStatus } from '../../context/BLEContext';

/**
 * useMCPBridge Hook
 * 
 * Integrates with the Electron MCP server via IPC.
 * - Registers handler for MCP commands
 * - Executes commands using BLE context (keyboard, mouse, etc.)
 * - Sends results back to the main process
 * - Forwards device serial data to the MCP server
 * 
 * Safe no-op in browser mode (when window.toothpasteMCP is undefined)
 * 
 * Security: Only processes commands when connectionStatus === ConnectionStatus.ready
 */
export function useMCPBridge() {
  const ble = useBLEContext();
  const commandHandlerRef = useRef(null);
  const serialDataRef = useRef([]);
  const bleRef = useRef(ble);

  // Keep bleRef current on every render so the stable handler always sees latest state
  bleRef.current = ble;

  useEffect(() => {
    // Check if MCP bridge is available (Electron only)
    if (!window.toothpasteMCP) {
      console.log('[MCPBridge] Not running in Electron, skipping MCP integration');
      return;
    }

    /**
     * Execute an MCP command using BLE context
     * Maps tool names to BLE handler functions
     */
    const executeCommand = async (command) => {
      const { id, tool, params } = command;
      const ble = bleRef.current;

      // getStatus is always allowed regardless of connection state
      if (tool === 'getStatus') {
        const result = {
          status: ble.getStatusLabel?.() || String(ble.status),
          statusCode: ble.status,
          connected: ble.status === ConnectionStatus.ready || ble.status === ConnectionStatus.connected,
          ready: ble.status === ConnectionStatus.ready,
          deviceName: ble.device?.name || null,
          firmwareVersion: ble.firmwareVersion || null
        };
        sendResult(id, true, JSON.stringify(result));
        return;
      }

      // getSerialData: return and optionally clear the buffer — always allowed
      if (tool === 'getSerialData') {
        const lines = [...serialDataRef.current];
        if (params?.clear !== false) serialDataRef.current = [];
        sendResult(id, true, JSON.stringify({ lines, count: lines.length }));
        return;
      }

      // Security: Only execute commands when device is ready (authenticated)
      if (ble.status !== ConnectionStatus.ready) {
        sendResult(id, false, null, `Device not ready (status: ${ble.status})`);
        return;
      }

      try {
        let result = null;
        let output = '';

        // Dispatch to appropriate handler based on tool
        switch (tool) {
          case 'typeText':
            result = await ble.sendString(params.text, params.slowMode);
            output = `Typed: ${params.text}`;
            break;

          case 'pressKey':
            result = await ble.sendKeyCode(params.key, params.slowMode);
            output = `Pressed: ${params.key}`;
            break;

          case 'mouseMove':
            result = await ble.sendMouse({ action: 'move', x: params.x, y: params.y });
            output = `Mouse moved by (${params.x}, ${params.y})`;
            break;

          case 'mouseClick':
            result = await ble.sendMouse({ action: 'click', button: params.button || 'left' });
            output = `Mouse clicked: ${params.button || 'left'}`;
            break;

          case 'mouseScroll':
            result = await ble.sendMouse({ action: 'scroll', delta: params.delta });
            output = `Mouse scrolled: ${params.delta}`;
            break;

          case 'mediaControl':
            result = await ble.sendMediaControl(params.action);
            output = `Media control: ${params.action}`;
            break;

          default:
            throw new Error(`Unknown tool: ${tool}`);
        }

        // Combine serial data captured during command execution
        const serialOutput = serialDataRef.current.join('\n');
        if (serialOutput) {
          output += `\n[Device Output]\n${serialOutput}`;
        }
        serialDataRef.current = []; // Clear for next command

        sendResult(id, true, output);
      } catch (error) {
        console.error(`[MCPBridge] Error executing ${tool}:`, error);
        sendResult(id, false, null, error.message);
      }
    };

    /**
     * Send result back to main process
     */
    const sendResult = (commandId, success, output, error) => {
      if (window.toothpasteMCP?.sendResult) {
        window.toothpasteMCP.sendResult({
          id: commandId,
          success,
          output: output || '',
          error: error || ''
        });
      }
    };

    /**
     * Handle serial data from device
     * Accumulates output from device SERIAL_DATA responses
     */
    const handleSerialData = (data) => {
      if (!data || data.length === 0) return;

      try {
        // Check if plain-text debug string (first byte is 0x00)
        if (data[0] === 0x00) {
          const text = new TextDecoder().decode(data.slice(1));
          serialDataRef.current.push(text);
        }
      } catch (error) {
        console.error('[MCPBridge] Error processing serial data:', error);
      }
    };

    // Register command handler (preload ensures only one listener is active)
    if (window.toothpasteMCP?.onCommand) {
      commandHandlerRef.current = executeCommand;
      window.toothpasteMCP.onCommand(executeCommand);
    }

    // Register serial data handler
    if (window.toothpasteMCP?.onSerialData) {
      window.toothpasteMCP.onSerialData(handleSerialData);
    }

    // No cleanup needed — preload.removeAllListeners handles deduplication
  }, []); // Empty deps: register once only, bleRef keeps state current

  return {
    /**
     * Manually enable MCP mode
     * Should be called when user toggles MCP in settings
     */
    enableMCP: (enabled) => {
      if (window.toothpasteMCP?.setMCPEnabled) {
        window.toothpasteMCP.setMCPEnabled(enabled);
      }
    },

    /**
     * Check if MCP bridge is available
     */
    isMCPAvailable: () => {
      return !!window.toothpasteMCP;
    },

    /**
     * Get accumulated serial data from last command
     */
    getSerialData: () => {
      return serialDataRef.current.join('\n');
    }
  };
}
