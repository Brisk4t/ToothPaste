import { createRequire } from 'module';
import { BLEAdapter } from './BLEAdapter.js';

// noble is CommonJS — use createRequire so this ESM file can load it.
const _require = createRequire(import.meta.url);

/**
 * Normalize a BLE UUID to noble's expected format: lowercase, no hyphens.
 * e.g. '19b10000-e8f2-537e-4f6c-d104768a1214' → '19b10000e8f2537e4f6cd104768a1214'
 */
function _norm(uuid) {
  return uuid.toLowerCase().replace(/-/g, '');
}

/**
 * Convert a Node.js Buffer to a plain ArrayBuffer.
 * We copy via Uint8Array to ensure a standalone ArrayBuffer (not a view into a shared pool).
 */
function _toArrayBuffer(buffer) {
  const ab = new ArrayBuffer(buffer.length);
  const view = new Uint8Array(ab);
  for (let i = 0; i < buffer.length; i++) view[i] = buffer[i];
  return ab;
}

/**
 * NativeBLEAdapter — BLEAdapter implementation using @stoprocent/noble.
 *
 * Uses the OS-level BLE stack directly:
 *   - Windows 10+ (build ≥ 15063): Windows Runtime (WinRT) BLE APIs
 *   - macOS: CoreBluetooth
 *   - Linux: BlueZ / HCI socket
 *
 * No Web Bluetooth / navigator.bluetooth dependency — safe to use in the
 * Electron main process or any plain Node.js context.
 *
 * Binary compatibility: @stoprocent/noble ships pre-compiled N-API
 * binaries (ABI-stable), so no compilation step is needed.
 */
export class NativeBLEAdapter extends BLEAdapter {
  constructor() {
    super();
    this._noble = null;       // lazy-loaded noble instance
    this._connected = false;
    this._notifListeners = new Map(); // charUUID → listener function
    // Holds a reference to the current peripheral so requestDevice can be
    // called again after a disconnect without re-importing noble.
    this._currentPeripheral = null;
  }

  // ===========================================================================
  // Internal helpers
  // ===========================================================================

  /**
   * Lazily load noble the first time it is needed.
   * Returns the singleton noble instance.
   */
  _getNoble() {
    if (this._noble) return this._noble;
    try {
      this._noble = _require('@stoprocent/noble');
    } catch (err) {
      throw new Error(
        `Native BLE (noble) is not available: ${err.message}. ` +
        'Ensure @stoprocent/noble is installed in client/web/node_modules.'
      );
    }
    return this._noble;
  }

  /**
   * Wait for the BLE adapter to reach poweredOn state (or reject on timeout).
   * @param {number} [timeoutMs=10000]
   */
  _waitForPoweredOn(noble, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      if (noble.state === 'poweredOn') {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        noble.removeListener('stateChange', onState);
        reject(new Error(`BLE adapter did not power on within ${timeoutMs}ms. Current state: ${noble.state}`));
      }, timeoutMs);

      const onState = (state) => {
        if (state === 'poweredOn') {
          clearTimeout(timer);
          resolve();
        } else if (state === 'poweredOff' || state === 'unsupported' || state === 'unauthorized') {
          clearTimeout(timer);
          noble.removeListener('stateChange', onState);
          reject(new Error(`BLE adapter state: ${state}`));
        }
      };
      noble.on('stateChange', onState);
    });
  }

  // ===========================================================================
  // BLEAdapter interface implementation
  // ===========================================================================

  /**
   * Scan for a ToothPaste device and return it as a device wrapper.
   *
   * Scans using the ToothPaste service UUID as a filter so only matching
   * peripherals trigger discovery. Resolves with the first peripheral found.
   * Rejects after 15 seconds if no device is found.
   *
   * @returns {Promise<{name: string, _peripheral: object}>}
   */
  async requestDevice() {
    const noble = this._getNoble();
    await this._waitForPoweredOn(noble);

    return new Promise((resolve, reject) => {
      // Service UUID filter in noble format: lowercase, no hyphens.
      const serviceUUID = _norm('19b10000-e8f2-537e-4f6c-d104768a1214');

      const timer = setTimeout(() => {
        noble.removeListener('discover', onDiscover);
        noble.stopScanningAsync().catch(() => {});
        reject(new Error('Native BLE scan timed out — no ToothPaste device found within 15 s'));
      }, 15000);

      const onDiscover = (peripheral) => {
        clearTimeout(timer);
        noble.removeListener('discover', onDiscover);
        noble.stopScanningAsync().catch(() => {});

        this._currentPeripheral = peripheral;

        resolve({
          name: peripheral.advertisement?.localName || `ToothPaste-${peripheral.id}`,
          _peripheral: peripheral,
        });
      };

      noble.on('discover', onDiscover);
      noble.startScanningAsync([serviceUUID], /* allowDuplicates */ false).catch((err) => {
        clearTimeout(timer);
        noble.removeListener('discover', onDiscover);
        reject(new Error(`BLE scan failed to start: ${err.message}`));
      });
    });
  }

  /**
   * Connect to the device's GATT server.
   * @param {{_peripheral: object}} device
   * @returns {Promise<{_peripheral: object}>}
   */
  async connectGATT(device) {
    await device._peripheral.connectAsync();
    this._connected = true;
    return { _peripheral: device._peripheral };
  }

  /**
   * Disconnect from the device.
   * @param {{_peripheral: object}} device
   */
  async disconnectDevice(device) {
    try {
      await device._peripheral.disconnectAsync();
    } catch (_) {
      // Ignore — may already be disconnected
    }
    this._connected = false;
  }

  /**
   * Discover the primary service and ALL of its characteristics in one call.
   * The returned service wrapper includes a pre-built char map so
   * getCharacteristic() can do a fast O(1) lookup.
   *
   * @param {{_peripheral: object}} gatt
   * @param {string} uuid  Full UUID string (hyphens ok, case-insensitive)
   * @returns {Promise<{_service: object, _charMap: Map<string, object>}>}
   */
  async getPrimaryService(gatt, uuid) {
    const peripheral = gatt._peripheral;
    const normalizedUUID = _norm(uuid);

    // Passing [] as characteristicsUuids tells noble to discover ALL characteristics.
    const { services, characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
      [normalizedUUID],
      []
    );

    if (!services || services.length === 0) {
      throw new Error(`BLE service ${uuid} not found on device`);
    }

    // Cache all discovered characteristics in a UUID → characteristic map.
    const charMap = new Map();
    for (const char of characteristics || []) {
      charMap.set(char.uuid, char);
    }

    return { _service: services[0], _charMap: charMap };
  }

  /**
   * Look up a characteristic by UUID from the pre-discovered service map.
   *
   * @param {{_service: object, _charMap: Map}} service
   * @param {string} uuid  Full UUID (hyphens ok, case-insensitive)
   * @returns {Promise<object>}  noble Characteristic instance
   */
  async getCharacteristic(service, uuid) {
    const normalizedUUID = _norm(uuid);

    // Fast path: already in the map from getPrimaryService
    if (service._charMap?.has(normalizedUUID)) {
      return service._charMap.get(normalizedUUID);
    }

    // Fallback: re-discover if somehow not cached (should not happen normally)
    const chars = await service._service.discoverCharacteristicsAsync([normalizedUUID]);
    if (!chars || chars.length === 0) {
      throw new Error(`BLE characteristic ${uuid} not found`);
    }
    return chars[0];
  }

  /**
   * Read a characteristic value.
   * @param {object} characteristic  noble Characteristic
   * @returns {Promise<ArrayBuffer>}
   */
  async readCharacteristic(characteristic) {
    const buffer = await characteristic.readAsync(); // Node.js Buffer
    return _toArrayBuffer(buffer);
  }

  /**
   * Write to a characteristic without response (fire-and-forget).
   * @param {object} characteristic  noble Characteristic
   * @param {Uint8Array|ArrayBuffer} value
   */
  async writeCharacteristicWithoutResponse(characteristic, value) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    const buf = Buffer.from(bytes);
    await characteristic.writeAsync(buf, /* withoutResponse */ true);
  }

  /**
   * Subscribe to characteristic notifications.
   * @param {object} characteristic  noble Characteristic
   * @param {function(ArrayBuffer): void} callback
   */
  async startNotifications(characteristic, callback) {
    const onData = (data /*, isNotification */) => {
      callback(_toArrayBuffer(data));
    };

    // Store listener so we can remove it in stopNotifications
    this._notifListeners.set(characteristic.uuid, onData);
    characteristic.on('data', onData);

    await characteristic.subscribeAsync();
  }

  /**
   * Unsubscribe from characteristic notifications.
   * @param {object} characteristic  noble Characteristic
   */
  async stopNotifications(characteristic) {
    const listener = this._notifListeners.get(characteristic.uuid);
    if (listener) {
      characteristic.removeListener('data', listener);
      this._notifListeners.delete(characteristic.uuid);
    }
    try {
      await characteristic.unsubscribeAsync();
    } catch (_) {
      // Ignore — may already be unsubscribed
    }
  }

  /**
   * @returns {boolean}
   */
  isConnected() {
    return this._connected;
  }

  /**
   * Get device MAC address.
   * Note: On Windows, WinRT exposes a device identifier rather than a raw
   * MAC address. The actual hardware MAC is read from the dedicated
   * characteristic in BLEManager, so this method is a best-effort helper.
   * @returns {Promise<string>}
   */
  async getDeviceMAC() {
    return this._currentPeripheral?.address || 'unknown';
  }

  /**
   * Register a one-shot disconnect callback.
   * @param {{_peripheral: object}} device
   * @param {function(): void} callback
   */
  onDisconnect(device, callback) {
    device._peripheral.once('disconnect', () => {
      this._connected = false;
      callback();
    });
  }
}
