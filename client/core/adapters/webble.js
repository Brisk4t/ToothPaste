import { BLEAdapter } from './BLEAdapter.js';

/**
 * WebBLEAdapter — Implementation of BLEAdapter using the Web Bluetooth API.
 *
 * Works in modern browsers and Electron windows with Web Bluetooth support.
 * Provides direct access to navigator.bluetooth.
 */
export class WebBLEAdapter extends BLEAdapter {
  constructor() {
    super();
    this.characteristicListeners = new Map(); // Track listeners for cleanup
  }

  // ===== Core BLE Operations =====

  async requestDevice() {
    if (!navigator.bluetooth) {
      throw new Error(
        'Web Bluetooth API not available. Ensure you are in a secure context (HTTPS)'
      );
    }

    const device = await navigator.bluetooth.requestDevice({
      filters: [{ name: 'Toothpaste' }],
      optionalServices: ['19b10000-e8f2-537e-4f6c-d104768a1214'],
    });

    return device;
  }

  async connectGATT(device) {
    const server = await device.gatt.connect();
    return server;
  }

  async disconnectDevice(device) {
    if (device?.gatt?.connected) {
      device.gatt.disconnect();
    }
  }

  async getPrimaryService(gatt, uuid) {
    return await gatt.getPrimaryService(uuid);
  }

  async getCharacteristic(service, uuid) {
    return await service.getCharacteristic(uuid);
  }

  async readCharacteristic(characteristic) {
    const value = await characteristic.readValue();
    return value;
  }

  async writeCharacteristicWithoutResponse(characteristic, value) {
    const buffer = value instanceof Uint8Array ? value : new Uint8Array(value);
    await characteristic.writeValueWithoutResponse(buffer);
  }

  async startNotifications(characteristic, callback) {
    await characteristic.startNotifications();

    const listener = (event) => {
      const { value } = event.target;
      callback(value);
    };

    characteristic.addEventListener('characteristicvaluechanged', listener);

    // Store listener for later cleanup
    if (!this.characteristicListeners.has(characteristic)) {
      this.characteristicListeners.set(characteristic, []);
    }
    this.characteristicListeners.get(characteristic).push(listener);
  }

  async stopNotifications(characteristic) {
    if (this.characteristicListeners.has(characteristic)) {
      const listeners = this.characteristicListeners.get(characteristic);
      for (const listener of listeners) {
        characteristic.removeEventListener('characteristicvaluechanged', listener);
      }
      this.characteristicListeners.delete(characteristic);
    }
    await characteristic.stopNotifications();
  }

  isConnected() {
    // In Web Bluetooth, we'd check device.gatt.connected if we have a reference
    // For now, rely on error handling in BLEManager
    return true;
  }

  async getDeviceMAC() {
    // Web Bluetooth doesn't expose MAC address directly
    // This would need to be read from a characteristic instead
    return 'unknown';
  }

  onDisconnect(device, callback) {
    if (device?.gatt) {
      device.gatt.addEventListener('gattserverdisconnected', callback);
    }
  }
}
