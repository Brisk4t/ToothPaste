import React, { createContext, useContext, useState, useRef } from "react";
import { keyExists, loadBase64 } from './Storage';
import { ECDHContext } from "./ECDHContext";
import { Packet } from "./PacketFunctions";


export const BLEContext = createContext();
export const useBLEContext = () => useContext(BLEContext);

export function BLEProvider({ children }) {
    const [status, setStatus] = React.useState(0); // 0 = disconnected, 1 = connected & paired, 2 = connected & not paired
    const [device, setDevice] = useState(null);
    const [server, setServer] = useState(null);
    const {loadKeys} = useContext(ECDHContext);
    const [pktCharacteristic, setpktCharacteristic] = useState(null);
    
    const readyToReceive = useRef({ promise: null, resolve: null });

    const serviceUUID = '19b10000-e8f2-537e-4f6c-d104768a1214'; // ClipBoard service UUID from example
    const packetCharacteristicUUID = '6856e119-2c7b-455a-bf42-cf7ddd2c5907'; // String pktCharacteristic UUID 
    const hidSemaphorepktCharacteristicUUID = '6856e119-2c7b-455a-bf42-cf7ddd2c5908'; // String pktCharacteristic UUID 

    const sendAuth = async (pktChar, device) => {
        console.log("SendAuth entered")
        if (!pktChar) return;

        try {
            const selfpkey = await loadBase64(device.id, 'SelfPublicKey')
            console.log("Send starting....")
            console.log(selfpkey);

            // If the public key is found send it to verify auth
            if(selfpkey){
                const encoder = new TextEncoder();
                const textData = (selfpkey instanceof Uint8Array) ? selfpkey : encoder.encode(selfpkey);
                
                const dataIV = new Uint8Array(16+12+textData.length); // Offset the data by IV length [TODO: Refactor this to make a consistent AUTH packet constructor]
                dataIV.set(textData,12);
                
                const packet = new Packet(1, dataIV, 0, 1, 0)
                const packetData = packet.serialize();
                console.log("Send AUTH packet of size: ", packetData.length)
                await pktChar.writeValueWithoutResponse(packetData);
            }
        }

        catch (error) {
            console.error(error);
        }
    }

    // Subscribe to the semaphore notification and attach its event listener
    const subscribeToSemaphore = async (semChar) => {
        try {
            await semChar.startNotifications();
            semChar.addEventListener('characteristicvaluechanged', (event) => {
                const dataView = event.target.value;
                const packed = dataView.getUint8(0);
                // Convert value (DataView) to string or bytes
                const packetType = (packed >> 4) & 0x0F;     // upper 4 bits
                const authStatus = packed & 0x0F;            // lower 4 bits


                console.log("AuthStatus:", authStatus);
                console.log("PacketType:", packetType);

                if(authStatus === 0){
                    setStatus(2);
                }
                else if(authStatus === 1){
                    setStatus(1);
                }
                // If there is a promise to be resolved, resolve it
                if (readyToReceive.current.resolve) {
                    readyToReceive.current.resolve();                // Signal the next packet can send
                    readyToReceive.current.promise = null;           // Reset
                    readyToReceive.current.resolve = null;
                }
            });
        } catch (err) {
            console.error("Failed to subscribe to semaphore notifications:", err);
        }
    }

    // Connecting to a clipboard device using WEB BLE
    const connectToDevice = async () => {
        try {
            // Look for device whose name starts with 'Clip' (change this later)
            const device = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: "Clip" },
                ],
                optionalServices: [serviceUUID],
            });

            // Set an on disconnect listener
            device.addEventListener("gattserverdisconnected", () => {
                setStatus(0);
                console.log("Clipboard Disconnected");
            });

            // Try to connect
            const server = await device.gatt.connect();

            // Get device info
            const service = await getServiceWithRetry(server, serviceUUID);
            const pktChar = await service.getCharacteristic(packetCharacteristicUUID);
            const semChar = await service.getCharacteristic(hidSemaphorepktCharacteristicUUID);

            setServer(server);
            setpktCharacteristic(pktChar);
            setDevice(device);

            await subscribeToSemaphore(semChar); // Subscribe to the BLE characteristic that notifies when a HID message has finished sending

            // If we don't know the public key of the device, we need to pair before sending
            if (!await keyExists(device.id)) {
                console.error("ECDH keys not found for device", device.id);
                setStatus(2);
            }

            // Else we can send
            else {
                await loadKeys(device.id);
                await sendAuth(pktChar, device);
            }
        }

        catch (error) {
            console.error("Connection failed", error);

            // Only set status to disconnected if the device is not connected, 
            // a ble scan cancel might fail but the device could still be connected
            if (!device || !device.gatt.connected) {
                setStatus(0);
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
                    await new Promise(r => setTimeout(r, 300));
                } else {
                    throw err;
                }
            }
        }
    }

    return (
        <BLEContext.Provider value={{
            device,
            server,
            pktCharacteristic,
            status,
            connectToDevice,
            readyToReceive,
        }}>

            {children}
        </BLEContext.Provider>
    );
}