import React, { createContext, useContext, useState } from "react";
import { keyExists } from './Storage';


export const BLEContext = createContext();
export const useBLEContext = () => useContext(BLEContext);

export function BLEProvider({ children }) {
    const [status, setStatus] = React.useState(0); // 0 = disconnected, 1 = connected & paired, 2 = connected & not paired
    const [device, setDevice] = useState(null);
    const [server, setServer] = useState(null);
    const [characteristic, setCharacteristic] = useState(null);

    const serviceUUID = '19b10000-e8f2-537e-4f6c-d104768a1214'; // ClipBoard service UUID from example
    const characteristicUUID = '6856e119-2c7b-455a-bf42-cf7ddd2c5907'; // String characteristic UUID from example

    const connectToDevice = async () => {
        
        try {
            
            const device = await navigator.bluetooth.requestDevice({
                filters: [
                {namePrefix: "Clip"},
                ],
                optionalServices: [serviceUUID],
            });

            const server = await device.gatt.connect();
            const service = await server.getPrimaryService(serviceUUID);
            const char = await service.getCharacteristic(characteristicUUID);
            
            setDevice(device);
            device.addEventListener("gattserverdisconnected", () => {
                setStatus(0);
                console.log("Clipboard Disconnected");
            });

            

            setServer(server);
            setCharacteristic(char);
            
            // If we know the public key of the device, it was paired before
            if(!await keyExists(device.id)) {
                console.error("ECDH keys not found for device", device.id);
                setStatus(2);
                
            }
            
            // If we don't know the public key, we need to pair
            else {
                setStatus(1);
            }
        } 
        
        catch (error) {
        console.error("Connection failed", error);

        // Only set status to disconnected if the device is not connected, a ble scan cancel might fail but the device could still be connected
        if (!device || !device.gatt.connected) {
            setStatus(0);
        }
    }
        
    };

    return (
        <BLEContext.Provider value={{
            device,
            setDevice,
            server,
            characteristic,
            status,
            connectToDevice}}>

            {children}
        </BLEContext.Provider>
    );
}