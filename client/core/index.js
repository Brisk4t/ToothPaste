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
// NOTE: NativeBLEAdapter (adapters/noble.js) is NOT re-exported here because
// it imports Node.js built-ins (createRequire, @stoprocent/noble) that break
// browser/renderer bundles. Import it directly in Electron main-process code:
//   import { NativeBLEAdapter } from '../core/adapters/noble.js';

// HID key mappings (shared between web and Electron)
export { HIDMap, modifierAliases, keyAliases, parseKeyCombo } from './HIDKeyMap.js';
