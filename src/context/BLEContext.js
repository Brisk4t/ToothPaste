import React, { createContext, useContext, useState } from "react";

export const BLEContext = createContext();
export const useBLEContext = () => useContext(BLEContext);

export function BLEProvider({ children }) {
    const [status, setStatus] = React.useState(0);
    const [device, setDevice] = useState(null);
    const [server, setServer] = useState(null);
    const [characteristic, setCharacteristic] = useState(null);

    const serviceUUID = '19b10000-e8f2-537e-4f6c-d104768a1214'; // ClipBoard service UUID from example
    const characteristicUUID = '19b10002-e8f2-537e-4f6c-d104768a1214'; // String characteristic UUID from example

    const connectToDevice = async () => {
        
        try {
            setStatus(0);
            const device = await navigator.bluetooth.requestDevice({
                filters: [
                {name: "ClipBoard"},
                ],
                optionalServices: [serviceUUID],
            });

            const server = await device.gatt.connect();
            const service = await server.getPrimaryService(serviceUUID);
            const char = await service.getCharacteristic(characteristicUUID);

            setDevice(device);
            setServer(server);
            setCharacteristic(char);
            setStatus(1);
        } 
        
        catch (error) {
            console.error(error);
            setStatus(0);
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