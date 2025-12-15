import React, { useState, useRef } from "react";
import { ESPLoader, Transport } from "esptool-js";
import CryptoJS from "crypto-js";
import { Progress, Typography, Button } from "@material-tailwind/react";

export default function UpdateController({onChangeOverlay}) {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("Idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const esploaderRef = useRef(null);
  const transportRef = useRef(null);

  const FIRMWARE_URL = "https://www.toothpasteapp.com/ClipBoardFirmware.bin"; // change to your URL

  // Connect to ESP32
  const connect = async () => {
    try {
      setStatus("Requesting serial port...");
      const port = await navigator.serial.requestPort({});
      transportRef.current = new Transport(port, true);

      const loader = new ESPLoader({
        transport: transportRef.current,
        baudrate: 460800,
        terminal: {
          clean: () => {},
          writeLine: console.log,
          write: console.log,
        },
      });

      setStatus("Syncing with chip...");
      const chip = await loader.main(); // Official esptool-js call
      esploaderRef.current = loader;

      setStatus(`Connected to ${chip}`);
      setConnected(true);
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message}`);
    }
  };

  // Flash firmware from URL
  const flashFirmware = async () => {
    try {
      if (!esploaderRef.current) throw new Error("Device not connected");
      const progressBars = [];

      setStatus("Downloading firmware...");
      const result = await fetch(FIRMWARE_URL);
      if (!result.ok) throw new Error("Failed to download firmware");
      
      const arrayBuffer = await result.arrayBuffer();
      const binaryStr = esploaderRef.current.ui8ToBstr(new Uint8Array(arrayBuffer));


      
      console.log(`Firmware size: ${binaryStr.length} bytes`);
      //console.log(`Firmware size: ${esploaderRef.current.flashSizeBytes()} bytes`);

      setStatus("Flashing firmware...");
      setProgress(0);

      await esploaderRef.current.writeFlash({
        fileArray: [{ data: binaryStr, address: 0x10000 }],
        flashSize: "16MB",
        eraseAll: false,
        compress: true,
        reportProgress: (_, written, total) =>
          setProgress(Math.round((written / total) * 100)),
      });
      await esploaderRef.current.after();

      setStatus("Flash complete");
      setProgress(100);
    } catch (err) {
      console.log(err);
      setStatus(`Error: ${err.message}`);
    }
  };

  // Disconnect device
  const disconnect = async () => {
    if (transportRef.current) await transportRef.current.disconnect();
    transportRef.current = null;
    esploaderRef.current = null;
    setConnected(false);
    setStatus("Disconnected");
    setProgress(0);
  };

  return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0,
            width: '100vw', height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.5)',
            
            display: 'flex',
            flexDirection:"column",
            justifyContent: 'center',
            alignItems:'center',

            zIndex: 9999,
        }}>
            <div style={{
                background: 'var(--color-shelf)',
                padding: 20,
                borderRadius: 8,
                width: '90%',
                maxWidth: 500,
                
                display: 'flex',
                flexDirection:"column",

                justifyContent: 'center',
                alignItems:'center',
                boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                position: 'relative'
            }}>
                {/* Close Button*/}
                <button
                    onClick={() => onChangeOverlay(null)}
                    style={{
                        position: 'absolute',
                        top: 10,
                        right: 10,
                        background: 'none',
                        border: 'none',
                        fontSize: 20,
                        cursor: 'pointer'
                    }}>
                ×
                </button>

                <Typography variant="h4" className="text-text font-sans normal-case font-semibold mb-4">
                    <span className="text-text">Update Your ToothPaste</span>
                </Typography>
                            
               <Progress value={progress} className="w-full my-2 border border-4 border-background bg-green" barProps={{className: "bg-primary"}} label="" />

                <Button
                    // ref={keyRef}
                    onClick={connect}
                    loading={false}
                    disabled={false}
                    className={`w-full h-10 my-4 bg-orange text-text hover:bg-primary-hover 
                    focus:bg-primary-focus active:bg-primary-active flex items-center justify-center size-sm disabled:bg-hover
                    ${connected ? "hidden" : ""}`}>

                    {/* <KeyIcon className={`h-7 w-7 mr-2  ${isLoading? "hidden":""}`} /> */}

                    {/* Paste to Device */}
                    <Typography variant="h6" className={`text-text font-sans normal-case font-semibold ${connected ? "hidden" : ""}`}>Pair</Typography>
                </Button>
                
                <Typography variant="h6" className={`text-gray-700 text-sm text-center ${connected ? "hidden" : ""}`}>
                  Hold down the button on your ToothPaste while plugging it in to a USB port to enter pairing mode. 
                  Then click "Pair" and find the device in the list.
                </Typography>



                <Button
                    // ref={keyRef}
                    onClick={flashFirmware}
                    loading={false}
                    disabled={false}
                    className={`w-full h-10 my-4 bg-primary text-text hover:bg-primary-hover focus:bg-primary-focus 
                      active:bg-primary-active flex items-center justify-center size-sm disabled:bg-hover
                      ${!connected ? "hidden" : ""}`}>

                    {/* <KeyIcon className={`h-7 w-7 mr-2  ${isLoading? "hidden":""}`} /> */}

                    {/* Paste to Device */}
                    <Typography variant="h6" className={`text-text font-sans normal-case font-semibold`}>Write</Typography>
                </Button>

                {error && (
                    <div style={{ marginTop: 20, color: 'red' }}>
                        {error}
                    </div>
                )}
            </div>
        </div>
    );
}
