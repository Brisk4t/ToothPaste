/**
 * Shared types and enums used across the electron app
 */

export const ConnectionStatus = {
  disconnected: 0,
  ready: 1,
  connected: 2,
  unsupported: 3
};

export const connectionStatusMap = {
  0: 'disconnected',
  1: 'ready',
  2: 'connected',
  3: 'unsupported'
};

export const ResponseType = {
  CHALLENGE: 0,
  PEER_KNOWN: 1,
  PEER_UNKNOWN: 2,
  SERIAL_DATA: 3
};
