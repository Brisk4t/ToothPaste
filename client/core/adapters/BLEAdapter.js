/**
 * BLEAdapter — Abstract base class for BLE implementations.
 *
 * This defines the interface that all BLE adapters must implement.
 * Examples: WebBLEAdapter (Web Bluetooth API), NativeBLEAdapter (node-ble, etc).
 *
 * The BLEManager uses this interface, so any adapter can be swapped without
 * changing BLEManager logic.
 */
export class BLEAdapter {
  /**
   * Request a BLE device from the user.
   * @returns {Promise<BluetoothDevice>}
   */
  async requestDevice() {
    throw new Error('requestDevice() not implemented');
  }

  /**
   * Connect to the device's GATT server.
   * @param {BluetoothDevice} device
   * @returns {Promise<BluetoothRemoteGATTServer>}
   */
  async connectGATT(device) {
    throw new Error('connectGATT() not implemented');
  }

  /**
   * Disconnect from the device.
   * @param {BluetoothDevice} device
   * @returns {Promise<void>}
   */
  async disconnectDevice(device) {
    throw new Error('disconnectDevice() not implemented');
  }

  /**
   * Get a primary service.
   * @param {BluetoothRemoteGATTServer} gatt
   * @param {string} uuid - Service UUID
   * @returns {Promise<BluetoothRemoteGATTService>}
   */
  async getPrimaryService(gatt, uuid) {
    throw new Error('getPrimaryService() not implemented');
  }

  /**
   * Get a characteristic from a service.
   * @param {BluetoothRemoteGATTService} service
   * @param {string} uuid - Characteristic UUID
   * @returns {Promise<BluetoothRemoteGATTCharacteristic>}
   */
  async getCharacteristic(service, uuid) {
    throw new Error('getCharacteristic() not implemented');
  }

  /**
   * Read a characteristic value.
   * @param {BluetoothRemoteGATTCharacteristic} characteristic
   * @returns {Promise<DataView>}
   */
  async readCharacteristic(characteristic) {
    throw new Error('readCharacteristic() not implemented');
  }

  /**
   * Write to a characteristic without response.
   * @param {BluetoothRemoteGATTCharacteristic} characteristic
   * @param {Uint8Array|ArrayBuffer} value
   * @returns {Promise<void>}
   */
  async writeCharacteristicWithoutResponse(characteristic, value) {
    throw new Error('writeCharacteristicWithoutResponse() not implemented');
  }

  /**
   * Start notifications on a characteristic.
   * @param {BluetoothRemoteGATTCharacteristic} characteristic
   * @param {Function} callback - Called with DataView on each notification
   * @returns {Promise<void>}
   */
  async startNotifications(characteristic, callback) {
    throw new Error('startNotifications() not implemented');
  }

  /**
   * Stop notifications on a characteristic.
   * @param {BluetoothRemoteGATTCharacteristic} characteristic
   * @returns {Promise<void>}
   */
  async stopNotifications(characteristic) {
    throw new Error('stopNotifications() not implemented');
  }

  /**
   * Check if connected.
   * @returns {boolean}
   */
  isConnected() {
    throw new Error('isConnected() not implemented');
  }

  /**
   * Get device MAC address.
   * @returns {Promise<string>} MAC address as string
   */
  async getDeviceMAC() {
    throw new Error('getDeviceMAC() not implemented');
  }

  /**
   * Register a disconnect callback.
   * @param {BluetoothDevice} device
   * @param {Function} callback
   * @returns {void}
   */
  onDisconnect(device, callback) {
    throw new Error('onDisconnect() not implemented');
  }
}
