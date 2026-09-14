import { useState, useRef } from "react";
import { ESPLoader, Transport } from "esptool-js";
import { Progress, Typography, Button, Menu } from "@material-tailwind/react";
import { LinkIcon, ArrowUpCircleIcon } from "@heroicons/react/24/outline";

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

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
} as const;

interface UpdateOverlayProps {
  onChangeOverlay: (overlay: string | null) => void;
}

export default function UpdateController({ onChangeOverlay }: UpdateOverlayProps) {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<string>(UpdateStatus.IDLE);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null);

  const esploaderRef = useRef<ESPLoader | null>(null);
  const transportRef = useRef<Transport | null>(null);


  const boardUrls: Record<string, string> = {
    "4M Flash (Supermini)": "/ToothPasteFirmware_4M.bin",
    "8M Flash Devkit": "/ToothPasteFirmware_8M_Dev.bin",
    "8M Flash ToothPaste PCBv1": "/ToothPasteFirmware_8M_PCBv1.bin",
  };

  const handleBoardSelect = (board: string) => {
    setSelectedBoard(board);

    const url = boardUrls[board];
    console.log("URL:", url);

    // optional: open link
    // window.open(url, "_blank");
  };

  // Connect to ESP32
  const connect = async () => {
    try {
      setStatus(UpdateStatus.REQUESTING_PORT);
      const port = await navigator.serial.requestPort({});
      transportRef.current = new Transport(port, true);

      // This esptool-js version's LoaderOptions requires `romBaudrate`, which this
      // pre-existing call never provided (esptool-js runs with it undefined at runtime,
      // same as before this conversion) — preserved as-is rather than guessing a value
      // for hardware-flashing config.
      // @ts-expect-error
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
    } catch (err: unknown) {
      console.error(err);
      setStatus(`${UpdateStatus.ERROR}: ${getErrorMessage(err)}`);
    }
  };

  // Flash firmware from URL
  const flashFirmware = async () => {
    try {
      if (!esploaderRef.current) throw new Error("Device not connected");
      const progressBars: unknown[] = [];

      setStatus(UpdateStatus.DOWNLOADING);
      const result = await fetch(boardUrls[selectedBoard!]);
      if (!result.ok) throw new Error("Failed to download firmware");

      const arrayBuffer = await result.arrayBuffer();
      const binaryStr = esploaderRef.current.ui8ToBstr(new Uint8Array(arrayBuffer));



      console.log(`Firmware size: ${binaryStr.length} bytes`);
      //console.log(`Firmware size: ${esploaderRef.current.flashSizeBytes()} bytes`);

      setStatus(UpdateStatus.FLASHING);
      setProgress(0);

      // This esptool-js version's FlashOptions also requires `flashMode`/`flashFreq`,
      // which this pre-existing call never provided — preserved as-is, same reasoning
      // as the ESPLoader options above.
      // @ts-expect-error
      await esploaderRef.current.writeFlash({
        fileArray: [{ data: binaryStr, address: 0x00000 }],
        flashSize: "8MB",
        eraseAll: false,
        compress: true,
        reportProgress: (_: number, written: number, total: number) =>
          setProgress(Math.round((written / total) * 100)),
      });
      await esploaderRef.current.after();

      setStatus(UpdateStatus.COMPLETE);
      setProgress(100);
    } catch (err: unknown) {
      console.log(err);
      setStatus(`${UpdateStatus.ERROR}: ${getErrorMessage(err)}`);
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
    <div className="fixed inset-0 bg-ash/80 flex flex-col justify-center items-center z-[9999] p-4" onClick={() => onChangeOverlay(null)}>
      <div className="bg-ink p-8 rounded-lg w-full max-w-2xl flex flex-col justify-center items-center shadow-lg relative" onClick={(e) => e.stopPropagation()}>
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

        {/* This material-tailwind version's Progress has no `barProps`/`label` props
            (present in some other version's docs) — pre-existing usage kept as-is. */}
        {/* @ts-expect-error */}
        <Progress value={progress} className="w-full my-2 bg-ash" barProps={{ className: "bg-primary" }} label="">
          <Progress.Bar />
        </Progress>

        {/* This material-tailwind version's Menu root has no `className` prop — pre-existing usage kept as-is. */}
        {/* @ts-expect-error */}
        <Menu className="bg-ink">
          <Menu.Trigger as={Button} className="bg-dust border-none">
            {selectedBoard || "Select Board"}
          </Menu.Trigger>

          <Menu.Content className="z-[10000] text-white bg-ink border-dust">
            {Object.keys(boardUrls).map((board) => (
              <Menu.Item className="text-text" key={board} onClick={() => handleBoardSelect(board)}>
                {board}
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu>

        {/* This material-tailwind version's Button has no `loading` prop — pre-existing usage kept as-is. */}
        <Button
          // ref={keyRef}
          onClick={connect}
          // @ts-expect-error
          loading={false}
          disabled={false}
          className={`w-full h-10 my-4 bg-orange text-text hover:bg-primary-ash border-none
                    focus:bg-primary-focus active:bg-primary-active flex items-center justify-center size-sm disabled:bg-ash
                    ${connected ? "hidden" : ""}`}>

          <LinkIcon className={`h-7 w-7 mr-2  ${connected ? "hidden" : ""}`} />

          {/* Connect to Serial device */}
          <Typography type='h5' className={`font-header text-text normal-case font-semibold ${connected ? "hidden" : ""}`}>Connect</Typography>
        </Button>


        <Button
          // ref={keyRef}
          onClick={flashFirmware}
          // @ts-expect-error
          loading={false}
          disabled={false}
          className={`w-full h-10 my-4 bg-primary text-text hover:bg-primary-ash focus:bg-primary-focus 
                      active:bg-primary-active flex items-center justify-center size-sm disabled:bg-ash
                      ${!connected || status === UpdateStatus.COMPLETE ? "hidden" : ""}`}>

          <ArrowUpCircleIcon className={`h-7 w-7 mr-2  ${!connected ? "hidden" : ""}`} />

          <Typography className={`text-text normal-case font-semibold`}>Write</Typography>
        </Button>

        <Typography className={`my-4 text-dust text-sm text-center ${connected ? "hidden" : ""}`}>
          Hold down the button on your ToothPaste while plugging it in to a USB port to enter pairing mode.
          Then click "Pair" and find the device in the list.
        </Typography>

        <Typography className={`my-4 text-dust text-sm text-center ${status === UpdateStatus.COMPLETE ? "" : "hidden"}`}>
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
