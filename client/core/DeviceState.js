/**
 * DeviceState handles persistence of device information and encryption keys.
 * Provides an abstract storage interface for different backends (IndexedDB, localStorage, etc).
 */
export class DeviceState {
  constructor(storageBackend = null) {
    this.backend = storageBackend; // { save, load, exists, delete }
  }

  /**
   * Save device connection info.
   * @param {string} deviceId - Device MAC or ID
   * @param {Object} info - { name, firmware, lastConnected, ... }
   * @returns {Promise<void>}
   */
  async saveDeviceInfo(deviceId, info) {
    if (!this.backend) return;
    await this.backend.save(deviceId, 'deviceInfo', JSON.stringify(info));
  }

  /**
   * Load device info.
   * @param {string} deviceId
   * @returns {Promise<Object|null>}
   */
  async loadDeviceInfo(deviceId) {
    if (!this.backend) return null;
    try {
      const json = await this.backend.load(deviceId, 'deviceInfo');
      return json ? JSON.parse(json) : null;
    } catch (err) {
      console.warn(`Failed to load device info for ${deviceId}:`, err);
      return null;
    }
  }

  /**
   * Get list of known devices.
   * @returns {Promise<string[]>} Array of device IDs
   */
  async getKnownDevices() {
    if (!this.backend?.listKeys) return [];
    try {
      return await this.backend.listKeys();
    } catch (err) {
      console.warn('Failed to list known devices:', err);
      return [];
    }
  }

  /**
   * Clear all state for a device.
   * @param {string} deviceId
   * @returns {Promise<void>}
   */
  async forget(deviceId) {
    if (!this.backend?.delete) return;
    try {
      await this.backend.delete(deviceId);
    } catch (err) {
      console.warn(`Failed to forget device ${deviceId}:`, err);
    }
  }
}
