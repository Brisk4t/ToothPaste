import React, {
    createContext,
    useContext,
    useState,
    useRef,
    useEffect,
    useMemo,
} from "react";
import { keyExists, loadBase64 } from "../services/Storage.js";
import { ECDHContext } from "./ECDHContext.jsx";
import { Packet, createUnencryptedPacket } from "../services/packetService/packetFunctions.js";
import { PacketQueue } from "../services/packetService/PacketQueue.js";
import { create, toBinary, fromBinary } from "@bufbuild/protobuf";

import * as ToothPacketPB from '../services/packetService/toothpacket/toothpacket_pb.js';


export const BLEContext = createContext();
export const useBLEContext = () => useContext(BLEContext);
export const ConnectionStatus = {
        disconnected: 0,
        ready: 1,
        connected: 2
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

    // FIFO queue for encrypted packets
    // Encrypt and send untyped data stream (string, array, etc.) with a random IV and GCM tag added, chunk data if too large
    // inputPayload can be a single payload or an array of payloads
    // Uses a FIFO queue where encryption produces packets and sending consumes them concurrently
    // (encoding into protobuf must be done by the calling function)
    const sendEncrypted = async (inputPayload, prefix=0) => {
        if (!pktCharacteristic) return;

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
    const subscribeToSemaphore = async (semChar) => {
        try {
            await semChar.startNotifications();
            semChar.addEventListener("characteristicvaluechanged", (event) => {
                const dataView = event.target.value;
                const packed = dataView.getUint8(0);
                // Convert value (DataView) to string or bytes
                const authStatus = packed & 0x0f; // lower 4 bits

                // If the device isnt authenticated it needs to be paired first
                if (authStatus === 0) {
                    setStatus(ConnectionStatus.connected);
                } 
                
                // If the device is authenticated we are ready to send
                else if (authStatus === 1) {
                    setStatus(ConnectionStatus.ready);
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

            await subscribeToSemaphore(semChar); // Subscribe to the BLE characteristic that notifies when a HID message has finished sending

            // Get the MAC : PubKey mapping from storage, if we don't have it we need to pair first
            if (!(await keyExists(device.macAddress))) {
                console.error("ECDH keys not found for device", device.macAddress);
                setStatus(ConnectionStatus.connected);
            }

            // Else we can send
            else {
                await loadKeys(device.macAddress);
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
