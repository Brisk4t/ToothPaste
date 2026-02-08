import React, {
    createContext,
    useContext,
    useState,
    useRef,
    useMemo,
} from "react";
import { keyExists, loadBase64 } from "../services/EncryptedStorage.js";
import { ECDHContext } from "./ECDHContext.jsx";
import { createUnencryptedPacket, unpackResponsePacket } from "../services/packetService/packetFunctions.js";
import { PacketQueue } from "../services/packetService/PacketQueue.js";
import { create, toBinary, fromBinary } from "@bufbuild/protobuf";

import * as ToothPacketPB from '../services/packetService/toothpacket/toothpacket_pb.js';


export const BLEContext = createContext();
export const useBLEContext = () => useContext(BLEContext);
export const supportedFirmwareVersions = ["0.9.0^"]; // Supported firmware versions for compatibility checks

export const ConnectionStatus = {
        disconnected: 0,
        ready: 1,
        connected: 2,
        unsupported: 3
};

export function BLEProvider({ children }) {

    // Constants
    const serviceUUID = "19b10000-e8f2-537e-4f6c-d104768a1214"; // ClipBoard service UUID from example
    
    const packetCharacteristicUUID = "6856e119-2c7b-455a-bf42-cf7ddd2c5907"; // String pktCharacteristic UUID
    const hidSemaphorepktCharacteristicUUID = "6856e119-2c7b-455a-bf42-cf7ddd2c5908"; // String pktCharacteristic UUID
    const macAddressCharacteristicUUID = "19b10002-e8f2-537e-4f6c-d104768a1214"

    // BLE Connection Variables
    const [status, setStatus] = React.useState(ConnectionStatus.disconnected); // 0 = disconnected, 1 = connected & paired, 2 = connected & not paired
    const [device, setDevice] = useState(null);
    const [server, setServer] = useState(null);
    const [pktCharacteristic, setpktCharacteristic] = useState(null);
    const pktCharRef = useRef(null);

    
    const { loadKeys, createEncryptedPackets } = useContext(ECDHContext);
    const readyToReceive = useRef({ promise: null, resolve: null });

    // Send a text string as a byte array without encryption
    const sendUnencrypted = async (inputString) => {
        try {
            const packetData = createUnencryptedPacket(inputString);
            await pktCharRef.current.writeValueWithoutResponse(packetData);
        } catch (error) {
            console.error("Error sending AUTH packet", error);
        }
    };

    // Encrypt and send untyped data stream (string, array, etc.) with a random IV and GCM tag added, chunk data if too large
    // inputPayload can be a single payload or an array of payloads
    // Uses a FIFO queue where encryption produces packets and sending consumes them concurrently
    // (encoding into protobuf must be done by the calling function)
    const sendEncrypted = async (inputPayload, prefix=0) => {
        if (!pktCharacteristic) return;

        // Create a packet queue to hold encrypted packets before sending
        const packetQueue = new PacketQueue();
        
        try {
            // Determine if input is an array or single payload
            const payloads = Array.isArray(inputPayload) ? inputPayload : [inputPayload];
            
            // Producer: Encrypt payloads and enqueue them
            const producerTask = (async () => {
                try {
                    for (const payload of payloads) {
                        for await (const packet of createEncryptedPackets(0, payload, true, prefix)) {
                            packetQueue.enqueue(packet);
                        }
                    }
                } finally {
                    packetQueue.finish();
                }
            })();

            // Consumer: Dequeue and send packets
            const consumerTask = (async () => {
                while (true) {
                    const packet = await packetQueue.dequeue();
                    if (packet === null) break;
                    
                    // Each packet is a ToothPaste DataPacket object with encryptedData component
                    await pktCharacteristic.writeValueWithoutResponse(
                        toBinary(ToothPacketPB.DataPacketSchema, packet)
                    );
                }
            })();

            // Wait for both producer and consumer to complete
            await Promise.all([producerTask, consumerTask]);

        } catch (error) {
            console.error("Error sending encrypted packet", error);
        }
    };

    // Try to load the self public key from storage and send it unencrypted
    const sendAuth = async (device) => {
        if (!pktCharRef.current) return;

        try {
            const selfPublicKey = await loadBase64(device.macAddress, "SelfPublicKey");

            // If the public key is found send it to verify auth
            if (selfPublicKey) {
                sendUnencrypted(selfPublicKey);
            }

        } catch (error) {
            console.error(error);
        }
    };

    // Subscribe to the semaphore notification and attach its event listener
    const subscribeToResponse = async (responseChar, deviceObj) => {
        try {
            await responseChar.startNotifications();
            responseChar.addEventListener("characteristicvaluechanged", async (event) => {
                const responsePacketBytes = event.target.value;
                
                // Convert to Uint8Array and log in base64
                const bytesArray = new Uint8Array(responsePacketBytes.buffer, responsePacketBytes.byteOffset, responsePacketBytes.byteLength);
                const base64String = btoa(String.fromCharCode.apply(null, bytesArray));

                var responsePacket = unpackResponsePacket(bytesArray);
                
                if (responsePacket.responseType === ToothPacketPB.ResponsePacket_ResponseType.CHALLENGE) {
                        await loadKeys(deviceObj.macAddress, responsePacket.challengeData);
                    setStatus(ConnectionStatus.ready);
                }

                else if (responsePacket.responseType === ToothPacketPB.ResponsePacket_ResponseType.PEER_KNOWN) {
                    console.log("Authentication successful");
                    setStatus(ConnectionStatus.ready);
                }

                else if (responsePacket.responseType === ToothPacketPB.ResponsePacket_ResponseType.PEER_UNKNOWN) {
                    console.log("Peer declined auth, authentication failed");
                    setStatus(ConnectionStatus.connected);
                }

                console.log("Firmware version:", responsePacket.firmwareVersion);
                if (!isVersionCompatible(responsePacket.firmwareVersion, supportedFirmwareVersions)) {
                    console.error("Incompatible firmware version:", responsePacket.firmwareVersion);
                    setStatus(ConnectionStatus.unsupported);
                }

  
                // If there is a promise to be resolved, resolve it
                if (readyToReceive.current.resolve) {
                    readyToReceive.current.resolve(); // Signal the next packet can send
                    readyToReceive.current.promise = null; // Reset
                    readyToReceive.current.resolve = null;
                }
            });
        } catch (err) {
            console.error(
                "Failed to subscribe to semaphore notifications:",
                err
            );
        }
    };

    // Connecting to a clipboard device using WEB BLE
    const connectToDevice = async () => {
        try {
            // Look for devices advertising the toothpaste service uuid
            const device = await navigator.bluetooth.requestDevice({
                //acceptAllDevices: true,
                filters: [{ services: [serviceUUID] }],
            });

            // Set an on disconnect listener
            device.addEventListener("gattserverdisconnected", () => {  
                setStatus(ConnectionStatus.disconnected); // Set status to disconnected
                setDevice(null); // Clear the device object, not doing this causes inconsistent connections when trying to reconnect

                console.log("Clipboard Disconnected");
            });

            // Try to connect
            if (!device.gatt.connected) {
                await device.gatt.connect();
            }

            const server = device.gatt;
            await new Promise(r => setTimeout(r, 200)); // Wait a bit before getting any GATT information

            // Get device info, retry on fail for each
            const service = await getServiceWithRetry(server, serviceUUID);
            pktCharRef.current = await getCharacteristicWithRetry(service, packetCharacteristicUUID);
            const semChar = await getCharacteristicWithRetry(service, hidSemaphorepktCharacteristicUUID);
            const MACChar = await getCharacteristicWithRetry(service, macAddressCharacteristicUUID);
            
            // Get the MAC address for the newly connected device (bypass mac obfuscation in WEB BLE)
            const dataView = await MACChar.readValue();
            let macStr = '';
            for (let i = 0; i < dataView.byteLength; i++) {
                macStr += dataView.getUint8(i).toString(16).padStart(2, '0');
            }
            device.macAddress = macStr;

            setServer(server);
            setpktCharacteristic(pktCharRef.current);
            setDevice(device);

            console.log("Connected to device:", device.name, "MAC:", device.macAddress);
            await subscribeToResponse(semChar, device); // Subscribe to the BLE characteristic that notifies when a HID message has finished sending

            // Get the MAC : PubKey mapping from storage, if we don't have it we need to pair first
            if (!(await keyExists(device.macAddress))) {
                console.error("ECDH keys not found for device", device.macAddress);
                setStatus(ConnectionStatus.connected);
            }

            // Else send auth and wait for semaphore to receive salt before loading keys
            else {
                await sendAuth(device);
            }
            
        } catch (error) {
            console.error("Connection failed", error);

            // Only set status to disconnected if the device is not connected,
            // a ble scan cancel might fail but the device could still be connected
            if (!device || !device.gatt.connected) {
                setStatus(ConnectionStatus.disconnected);
            }
        }
    };

    // Generic retry wrapper for async BLE calls
    const retryAsyncCall = async (fn, param, attempts = 3, warnMsg = "Retrying...") => {
        for (let i = 0; i < attempts; i++) {
            try {
                return await fn(param);
            } catch (err) {
                if (i < attempts - 1) {
                    console.warn(warnMsg, err);
                    await new Promise((r) => setTimeout(r, 300));
                } else {
                    throw err;
                }
            }
        }
    };

    // Get service details, retry on fail
    const getServiceWithRetry = async (server, uuid, attempts = 3) =>
        retryAsyncCall((uuid) => server.getPrimaryService(uuid), uuid, attempts, "Retrying service discovery...");

    // Get characteristic details, retry on fail
    const getCharacteristicWithRetry = async (service, characteristicUUID, attempts = 3) =>
        retryAsyncCall((characteristicUUID) => service.getCharacteristic(characteristicUUID), characteristicUUID, attempts, "Retrying characteristic discovery...");

    const contextValue = useMemo(() => ({
        device,
        server,
        pktCharacteristic,
        status,
        connectToDevice,
        readyToReceive,
        sendEncrypted,
        sendUnencrypted,
    }), [device, server, pktCharacteristic, status, connectToDevice, readyToReceive, sendEncrypted, sendUnencrypted]);

    return (
        <BLEContext.Provider value={contextValue}>
            {children}
        </BLEContext.Provider>
    );
}

/**
 * Check if a device firmware version is compatible with supported versions
 * Supports exact matches, caret versions (^), and suffix validation
 * @param {string} deviceFirmwareVersion - Device version string (e.g., "1.0.0" or "1.0.0-beta")
 * @param {string[]} supportedFirmwareVersions - List of supported versions with optional "^" for >= matching and suffixes
 * @returns {boolean} True if version is supported, false otherwise
 */
export function isVersionCompatible(deviceFirmwareVersion, supportedFirmwareVersions = []) {
    // Extract base version (x.y.z) and suffix (anything after)
    const versionMatch = deviceFirmwareVersion.match(/^(\d+\.\d+\.\d+)(.*)/);
    
    if (!versionMatch) {
        console.error("Invalid firmware version format:", deviceFirmwareVersion);
        return false; // Invalid version format
    }
    
    const baseVersion = versionMatch[1];
    const suffix = versionMatch[2]; // Empty string if no suffix
    
    // Check for exact full version match
    if (supportedFirmwareVersions.includes(deviceFirmwareVersion)) {
        return true;
    }
    
    // If device has a suffix, the suffix must be explicitly supported
    if (suffix && !supportedFirmwareVersions.includes(suffix)) {
        return false;
    }
    
    // Check the base version
    // Exact match
    if (supportedFirmwareVersions.includes(baseVersion)) {
        return true;
    }
    
    // Check for caret versions (x.y.z^ means >= x.y.z)
    for (const supportedVersion of supportedFirmwareVersions) {
        if (supportedVersion.endsWith('^')) {
            const supportedBase = supportedVersion.slice(0, -1); // Remove the '^'
            if (isVersionGreaterOrEqual(baseVersion, supportedBase)) {
                return true;
            }
        }
    }
    
    return false;
}

/**
 * Compare semantic versions (x.y.z format)
 * @param {string} version1 - First version to compare
 * @param {string} version2 - Second version to compare
 * @returns {boolean} True if version1 >= version2
 */
function isVersionGreaterOrEqual(version1, version2) {
    const v1 = version1.split('.').map(Number);
    const v2 = version2.split('.').map(Number);
    
    for (let i = 0; i < 3; i++) {
        if (v1[i] > v2[i]) return true;
        if (v1[i] < v2[i]) return false;
    }
    
    return true; // Versions are equal
}
