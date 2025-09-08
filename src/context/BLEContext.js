import React, {
    createContext,
    useContext,
    useState,
    useRef,
    useEffect,
} from "react";
import { keyExists, loadBase64 } from "../controllers/Storage";
import { ECDHContext } from "./ECDHContext";
import { Packet } from "../controllers/PacketFunctions";

export const BLEContext = createContext();
export const useBLEContext = () => useContext(BLEContext);

export function BLEProvider({ children, showOverlay, setShowOverlay }) {

    // Constants
    const connectionStatus = {
        disconnected: 0,
        ready: 1,
        connected: 2
    };
    const serviceUUID = "19b10000-e8f2-537e-4f6c-d104768a1214"; // ClipBoard service UUID from example
    
    const packetCharacteristicUUID = "6856e119-2c7b-455a-bf42-cf7ddd2c5907"; // String pktCharacteristic UUID
    const hidSemaphorepktCharacteristicUUID = "6856e119-2c7b-455a-bf42-cf7ddd2c5908"; // String pktCharacteristic UUID
    const macAddressCharacteristicUUID = "19b10002-e8f2-537e-4f6c-d104768a1214"

    // BLE Connection Variables
    const [status, setStatus] = React.useState(connectionStatus.disconnected); // 0 = disconnected, 1 = connected & paired, 2 = connected & not paired
    const [device, setDevice] = useState(null);
    const [server, setServer] = useState(null);
    const MACAddress = useRef(null);
    const [pktCharacteristic, setpktCharacteristic] = useState(null);
    const pktCharRef = useRef(null);

    
    const showOverlayRef = useRef(showOverlay);
    const { loadKeys, createEncryptedPackets } = useContext(ECDHContext);
    const readyToReceive = useRef({ promise: null, resolve: null });



    // Keep track of the overlay visibility
    useEffect(() => {
        showOverlayRef.current = showOverlay;
    }, [showOverlay]);

    // Attach a promise to the readyToReceive ref, this acts as the send semaphore
    const waitForReady = () => {
        // If the ref currently doesn't have a promise, create one
        if (!readyToReceive.current.promise) {
            readyToReceive.current.promise = new Promise((resolve) => {
                readyToReceive.current.resolve = resolve; // The promise resolver is in the 'resolve' key of the ref
            });
        }
        return readyToReceive.current.promise;
    };

    // Send a text string as a byte array without encrypting it padded with 0 where necessary
    const sendUnencrypted = async (inputString) => {
        try {
            const encoder = new TextEncoder();
            const textData = encoder.encode(inputString); // Encode the input string into a byte array

            const dataPadded = new Uint8Array(16 + 12 + textData.length); // Offset the data by IV length
            dataPadded.set(textData, 12);

            const packet = new Packet(1, dataPadded, 0, 1, 1);
            const packetData = packet.serialize();

            await pktCharRef.current.writeValueWithoutResponse(packetData);
        } catch (error) {
            console.error("Error sending AUTH packet", error);
        }
    };

    // Encrypt and send untyped data stream (string, array, etc.) with a random IV and GCM tag added, chunk data if too large
    const sendEncrypted = async (inputArray, prefix=0) => {
        if (!pktCharacteristic) return;

        try {
            var count = 0;
            console.log("Send starting....", inputArray);

            for await (const packet of createEncryptedPackets(0, inputArray, true, prefix)) {
                console.log("Sending packet ", count);
                await pktCharacteristic.writeValueWithoutResponse(
                    packet.serialize()
                );

                await waitForReady(); // Attach a promise to the ref
                await readyToReceive.current.promise; // Wait in this iteration of the loop till the promise is consumed
                count++;
            }
        } catch (error) {
            console.error(error);
        }
    };

    // Try to load the self public key from storage and send it unencrypted
    const sendAuth = async (device) => {
        console.log("SendAuth entered");
        if (!pktCharRef.current) return;

        try {
            const selfpkey = await loadBase64(device.macAddress, "SelfPublicKey");
            console.log("Send starting....");
            console.log(selfpkey);

            // If the public key is found send it to verify auth
            if (selfpkey) {
                sendUnencrypted(selfpkey);
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
                const packetType = (packed >> 4) & 0x0f; // upper 4 bits
                const authStatus = packed & 0x0f; // lower 4 bits

                console.log("AuthStatus:", authStatus);
                console.log("PacketType:", packetType);

                // If the device isnt authenticated it needs to be paired first
                if (authStatus === 0) {
                    setStatus(connectionStatus.connected);
                } 
                
                // If the device is authenticated we are ready to send
                else if (authStatus === 1) {
                    if (showOverlayRef.current) setShowOverlay(false);
                    setStatus(connectionStatus.ready);
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
                //optionalServices: [serviceUUID],
            });

            // Set an on disconnect listener
            device.addEventListener("gattserverdisconnected", () => {
                // If the device disconnects while the pairing overlay is open, close the overlay
                if (showOverlayRef.current) {
                    setShowOverlay(false);
                }
                setStatus(connectionStatus.disconnected);
                
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
            
            // Get the MAC address for the newly connected device
            const dataView = await MACChar.readValue();
            let macStr = '';
            for (let i = 0; i < dataView.byteLength; i++) {
                macStr += dataView.getUint8(i).toString(16).padStart(2, '0');
            }
            device.macAddress = macStr;
            console.log("MAC Address string:", macStr);

            setServer(server);
            setpktCharacteristic(pktCharRef.current);
            setDevice(device);

            await subscribeToSemaphore(semChar); // Subscribe to the BLE characteristic that notifies when a HID message has finished sending

            // If we don't know the public key of the device, we need to pair before sending
            if (!(await keyExists(device.macAddress))) {
                console.error("ECDH keys not found for device", device.macAddress);
                setStatus(connectionStatus.connected);
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
                setStatus(connectionStatus.disconnected);
            }
        }
    };

    // Retry service query to prevent "ghost connections" where BLE is connected but the service query returns too quickly
    const getServiceWithRetry = async (server, uuid, attempts = 3) => {
        for (let i = 0; i < attempts; i++) {
            try {
                return await server.getPrimaryService(uuid);
            } catch (err) {
                if (i < attempts - 1) {
                    console.warn("Retrying service discovery...", err);
                    await new Promise((r) => setTimeout(r, 300));
                } else {
                    throw err;
                }
            }
        }
    };
    
    // Retry service query to prevent "ghost connections" where BLE is connected but the service query returns too quickly
    const getCharacteristicWithRetry = async (service, characteristicUUID, attempts = 3) => {
        for (let i = 0; i < attempts; i++) {
            try {
                return await service.getCharacteristic(characteristicUUID);
            } catch (err) {
                if (i < attempts - 1) {
                    console.warn("Retrying characteristic discovery...", err);
                    await new Promise((r) => setTimeout(r, 300));
                } else {
                    throw err;
                }
            }
        }
    };

    return (
        <BLEContext.Provider
            value={{
                device,
                server,
                pktCharacteristic,
                status,
                connectToDevice,
                readyToReceive,
                sendEncrypted,
                sendUnencrypted,
            }}
        >
            {children}
        </BLEContext.Provider>
    );
}
