/**
 * client/core/index.js
 *
 * Main entry point for the ToothPaste core BLE library.
 * Re-exports all public classes and adapters.
 *
 * Usage:
 *   import { BLEManager, SessionManager, PacketHandler, WebBLEAdapter } from '../client/core/index.js';
 */

export { BLEManager } from './BLEManager.js';
export { SessionManager } from './SessionManager.js';
export { PacketHandler } from './PacketHandler.js';
export { DeviceState } from './DeviceState.js';

// Adapters
export { BLEAdapter } from './adapters/BLEAdapter.js';
export { WebBLEAdapter } from './adapters/webble.js';
