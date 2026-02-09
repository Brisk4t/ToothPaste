import React, { useState, useRef } from "react";
import { ESPLoader, Transport } from "esptool-js";
import { Progress, Typography, Button, } from "@material-tailwind/react";
import { LinkIcon, ArrowUpCircleIcon } from "@heroicons/react/24/outline";

// Status enum
const UpdateStatus = {
  IDLE: 'Idle',
  REQUESTING_PORT: 'Requesting serial port...',
  SYNCING: 'Syncing with chip...',
  CONNECTED: 'Connected',
  DOWNLOADING: 'Downloading firmware...',
  FLASHING: 'Flashing firmware...',
  COMPLETE: 'Flash complete',
  DISCONNECTED: 'Disconnected',
  ERROR: 'Error',
};

export default function UpdateController({ onChangeOverlay }) {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState(UpdateStatus.IDLE);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const esploaderRef = useRef(null);
  const transportRef = useRef(null);

  const FIRMWARE_URL = "/ClipBoardFirmware.bin"; // change to your URL

  // Connect to ESP32
  const connect = async () => {
    try {
      setStatus(UpdateStatus.REQUESTING_PORT);
      const port = await navigator.serial.requestPort({});
      transportRef.current = new Transport(port, true);

      const loader = new ESPLoader({
        transport: transportRef.current,
        baudrate: 460800,
        terminal: {
          clean: () => { },
          writeLine: console.log,
          write: console.log,
        },
      });

      setStatus(UpdateStatus.SYNCING);
      const chip = await loader.main(); // Official esptool-js call
      esploaderRef.current = loader;

      setStatus(`${UpdateStatus.CONNECTED} to ${chip}`);
      setConnected(true);
    } catch (err) {
      console.error(err);
      setStatus(`${UpdateStatus.ERROR}: ${err.message}`);
    }
  };

  // Flash firmware from URL
  const flashFirmware = async () => {
    try {
      if (!esploaderRef.current) throw new Error("Device not connected");
      const progressBars = [];

      setStatus(UpdateStatus.DOWNLOADING);
      const result = await fetch(FIRMWARE_URL);
      if (!result.ok) throw new Error("Failed to download firmware");

      const arrayBuffer = await result.arrayBuffer();
      const binaryStr = esploaderRef.current.ui8ToBstr(new Uint8Array(arrayBuffer));



      console.log(`Firmware size: ${binaryStr.length} bytes`);
      //console.log(`Firmware size: ${esploaderRef.current.flashSizeBytes()} bytes`);

      setStatus(UpdateStatus.FLASHING);
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

      setStatus(UpdateStatus.COMPLETE);
      setProgress(100);
    } catch (err) {
      console.log(err);
      setStatus(`${UpdateStatus.ERROR}: ${err.message}`);
    }
  };

  // Disconnect device
  const disconnect = async () => {
    if (transportRef.current) await transportRef.current.disconnect();
    transportRef.current = null;
    esploaderRef.current = null;
    setConnected(false);
    setStatus(UpdateStatus.DISCONNECTED);
    setProgress(0);
  };

  return (
    <div className="fixed inset-0 bg-hover/80 flex flex-col justify-center items-center z-[9999] p-4" onClick={() => onChangeOverlay(null)}>
      <div className="bg-shelf p-8 rounded-lg w-full max-w-2xl flex flex-col justify-center items-center shadow-lg relative" onClick={(e) => e.stopPropagation()}>
        {/* Close Button*/}
        <button
          onClick={() => onChangeOverlay(null)}
          className="absolute top-2.5 right-2.5 bg-transparent text-text border-0 text-2xl cursor-pointer"
        >
          ×
        </button>

        <Typography type="h4" className="text-text font-header normal-case font-semibold mb-4">
          <span className="text-text">Update Your ToothPaste</span>
        </Typography>

        <Progress value={progress} className="w-full my-2 bg-hover" barProps={{ className: "bg-primary" }} label="">
          <Progress.Bar />
        </Progress>

        <Button
          // ref={keyRef}
          onClick={connect}
          loading={false}
          disabled={false}
          className={`w-full h-10 my-4 bg-orange text-text hover:bg-primary-hover border-none
                    focus:bg-primary-focus active:bg-primary-active flex items-center justify-center size-sm disabled:bg-hover
                    ${connected ? "hidden" : ""}`}>

          <LinkIcon className={`h-7 w-7 mr-2  ${connected ? "hidden" : ""}`} />

          {/* Paste to Device */}
          <Typography type='h5' className={`font-header text-text normal-case font-semibold ${connected ? "hidden" : ""}`}>Connect</Typography>
        </Button>

        <Button
          // ref={keyRef}
          onClick={flashFirmware}
          loading={false}
          disabled={false}
          className={`w-full h-10 my-4 bg-primary text-text hover:bg-primary-hover focus:bg-primary-focus 
                      active:bg-primary-active flex items-center justify-center size-sm disabled:bg-hover
                      ${!connected || status === UpdateStatus.COMPLETE ? "hidden" : ""}`}>

          <ArrowUpCircleIcon className={`h-7 w-7 mr-2  ${!connected ? "hidden" : ""}`} />

          <Typography className={`text-text normal-case font-semibold`}>Write</Typography>
        </Button>

        <Typography className={`my-4 text-gray-300 text-sm text-center ${connected ? "hidden" : ""}`}>
          Hold down the button on your ToothPaste while plugging it in to a USB port to enter pairing mode.
          Then click "Pair" and find the device in the list.
        </Typography>

        <Typography className={`my-4 text-gray-300 text-sm text-center ${status === UpdateStatus.COMPLETE ? "" : "hidden"}`}>
          Your ToothPaste has been updated successfully! Unplug and replug it to get started.
        </Typography>


        {error && (
          <div style={{ marginTop: 20, color: 'red' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
