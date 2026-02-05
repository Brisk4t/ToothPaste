import React, { useState, useEffect, useRef, useCallback } from "react";
import { IconButton, Badge, Card, Typography, Input, Progress, Button } from "@material-tailwind/react";
import {
    HomeIcon,
    PlayCircleIcon,
    Bars3Icon,
    XMarkIcon,
    ClipboardIcon,
    PlayIcon,
    LinkIcon,
    QuestionMarkCircleIcon,
    CpuChipIcon,
    SignalSlashIcon,
    SignalIcon,
} from "@heroicons/react/24/outline";

import { useBLEContext, ConnectionStatus } from "../../context/BLEContext";
import ToothPaste from "../../assets/ToothPaste.png";
import { createRenamePacket } from "../../controllers/PacketFunctions";

export function useClickOrLongPress(longPressTime = 2000) {
    const timerRef = useRef(null);
    const [longPressed, setLongPressed] = useState(false);

    const start = useCallback(
        (onLongPress) => {
            setLongPressed(false);
            // Start a timeout for long press
            timerRef.current = setTimeout(() => {
                setLongPressed(true);
                if (onLongPress) onLongPress();
            }, longPressTime);
        },
        [longPressTime]
    );

    const cancel = useCallback(() => {
        clearTimeout(timerRef.current);
        timerRef.current = null;
    }, []);

    const end = useCallback(
        (onClick) => {
            clearTimeout(timerRef.current);
            timerRef.current = null;
            if (!longPressed && onClick) {
                onClick();
            }
        },
        [longPressed]
    );

    return { start, cancel, end, longPressed };
}

function EditableDeviceName({ name, setName, isEditing, setIsEditing}) {
    // Once user unfocuses from editing
    const handleBlur = () => {
        setIsEditing(false);
    };

    // Once user presses "Enter" while editing
    const handleKeyPress = (e) => {
        if (e.key === "Enter") {
            setIsEditing(false);
        }
    };

    return (
        <>
            {isEditing ? (
                <Input
                    label={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyPress}
                    className="text-text font-sans font-medium normal-case"
                    color="white"
                    size="md"
                    autoFocus
                />
            ) : (
                <Typography
                    variant="h6"
                    color="text"
                    className="text-lg font-sans font-medium normal-case"
                    style={{ cursor: "pointer" }}
                >
                    {name}
                </Typography>
            )}
        </>
    );
}

// Status icon for a given device
function ConnectionButton() {
    const LONG_PRESS_DURATION = 2000;
    const { connectToDevice, status, device, sendEncrypted } = useBLEContext();
    const { start, end, cancel, longPressed } = useClickOrLongPress(LONG_PRESS_DURATION);
    const [progress, setProgress] = useState(0);
    const [isEditing, setIsEditing] = useState(false);
    const [wasLongPressed, setWasLongPressed] = useState(false);
    const intervalRef = useRef(null); // track interval across renders
    const longPressTriggered = useRef(false);


    const [name, setName] = useState(device?.name || "Connect to Device");
    // Sync name when device changes
    useEffect(() => {
        setName(device?.name || "Connect to Device");
    }, [device]);

    const borderClass =
        {
            0: "border-secondary",
            1: "border-primary",
            2: "border-orange", // make sure you defined `border-tertiary` in Tailwind config
        }[status] || "border-orange"; // fallback if undefined
    


    // Once isEditing becmes false, if the device name was changed by the user, notify the device
    useEffect(() => {
        if (isEditing === false && wasLongPressed) {
            // This runs only when isEditing becomes false
            if(device?.name !== name){
                setName(name+'\0')

                var renamePacket = createRenamePacket(name);
                sendEncrypted(renamePacket) // 3 indicated a rename packet
                setWasLongPressed(false);
            }
        }
    }, [isEditing, device?.name, name, sendEncrypted]); // Trigger whenever these change

    // Wrapper for start that also increments progress
    const handleStart = (callback) => {
        if (!device) return;

        setProgress(0);
        longPressTriggered.current = false;
        const startTime = Date.now();

        intervalRef.current = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const percentage = Math.min((elapsed / LONG_PRESS_DURATION) * 100, 100);
            setProgress(percentage);

            if (elapsed >= LONG_PRESS_DURATION) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
                longPressTriggered.current = true;
                setWasLongPressed(true);
                callback(); // long press action
            }
        }, 16);
    };

    // On cancel or end
    const handleEnd = (clickFn) => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setProgress(0);

        if (!longPressTriggered.current) {
            clickFn?.(); // only run click if long press didn’t trigger
        }
    };

    return (
        <div className="flex justify-left w-full">
           <Button
                title="Click to connect to a device, hold to rename it."
                className={`flex flex-col items-center justify-center w-full p-4 border-2 ${borderClass} bg-transparent hover:border-text min-h-10`}
                style={{
                    backgroundImage: `linear-gradient(to right, rgba(79, 172, 254, 0.2) 0%, rgba(79, 172, 254, 0.2) ${progress}%, transparent ${progress}%, transparent 100%)`,
                    backgroundRepeat: 'no-repeat',
                    transition: 'background-image 0.016s linear'
                }}
                onMouseDown={() => {if (device && status === 1) handleStart(() => setIsEditing(true));}}
                onMouseLeave={() => {handleEnd(cancel);}}
                onMouseUp={() => handleEnd(() => connectToDevice())}
            >
                <div className="flex items-center justify-between w-full">
                    <div className="mr-10">
                        {/* If a device is connected get its name */}
                        <EditableDeviceName
                            variant="h6"
                            color="text"
                            device={device}
                            isEditing={isEditing}
                            setIsEditing={setIsEditing}
                            name={name}
                            setName={setName}
                        ></EditableDeviceName>
                    </div>
                    {/* Change the icon for connected and disconnected states */}
                    {status !== 0 && <SignalIcon className="h-5 w-5" />}
                    {status === 0 && <SignalSlashIcon className="h-5 w-5" />}
                </div>
            </Button>
        </div>
    );
}

export default function Navbar({ onChangeOverlay, onNavigate, activeView, activeOverlay }) {
    const [open, setOpen] = React.useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const { status, device } = useBLEContext();

    const borderClass =
        {
            0: "border-secondary",
            1: "border-primary",
            2: "border-orange", // make sure you defined `border-tertiary` in Tailwind config
        }[status] || "border-orange"; // fallback if undefined

    console.log("Status is: ", status);

    useEffect(() => {
        if(activeOverlay == "pair")
        switch(status){
            case ConnectionStatus.ready:
                onChangeOverlay(null);
                break;
            
            case ConnectionStatus.disconnected:
                onChangeOverlay(null);
                break;
        }
    }, [activeOverlay, status, onChangeOverlay]);
    return (
        <div className="w-full bg-shelf text-white">
            <div className="flex justify-between h-24 items-center px-4">
                {/* Left: Logo */}
                <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setIsOpen(false)}>
                    <img src={ToothPaste} alt="brand" className="h-10 w-10" />
                    <Typography variant="h3" color="text" className="select-none">
                        ToothPaste
                    </Typography>
                </div>

                {/* Center: Desktop menu */}
                <div className="hidden lg:flex flex-1 justify-center space-x-5">
                    <button
                        disabled={status === 2}
                        className={`flex items-center space-x-1 p-2 gap-2 rounded disabled:text-hover disabled:hover:bg-transparent ${
                            activeView === "live" ? "disabled:border-hover border border-text" : "hover:bg-hover"
                        }`}
                        onClick={() => onNavigate("live")}
                    >
                        <PlayIcon className="h-5 w-5" />
                        <Typography variant="h4">Live Capture</Typography>
                    </button>

                    <button
                        disabled={status === 2}
                        className={`flex items-center space-x-1 p-2 gap-2 rounded disabled:text-hover disabled:hover:bg-transparent ${
                            activeView === "paste" ? "disabled:border-hover border border-text" : "hover:bg-hover"
                        }`}
                        onClick={() => onNavigate("paste")}
                    >
                        <ClipboardIcon className="h-5 w-5" />
                        <Typography variant="h4">Paste</Typography>
                    </button>
                    
                    <button
                        disabled={status === 2}
                        className={`flex items-center space-x-1 p-2 gap-2 rounded disabled:text-hover disabled:hover:bg-transparent ${
                            activeView === "update" ? "disabled:border-hover border border-text" : "hover:bg-hover"
                        }`}
                        onClick={() => onChangeOverlay("update")}
                    >
                        <CpuChipIcon className="h-5 w-5" />
                        <Typography variant="h4">Update</Typography>
                    </button>

                    <button
                        disabled={false}
                        className="flex items-center space-x-1 p-2 gap-2 rounded hover:bg-hover"
                        onClick={() => onChangeOverlay("quickstart")}
                        title="Show Quick Start Guide"
                    >
                        <PlayCircleIcon className="h-5 w-5" />
                        <Typography variant="h4">Quick Start</Typography>
                    </button>

                    <button
                        disabled={false}
                        className={`flex items-center space-x-1 p-2 gap-2 rounded disabled:text-hover disabled:hover:bg-transparent ${
                            activeView === "about" ? "disabled:border-hover border border-text" : "hover:bg-hover"
                        }`}
                        onClick={() => onNavigate("about")}
                    >
                        <QuestionMarkCircleIcon className="h-5 w-5" />
                        <Typography variant="h4">About</Typography>
                    </button>

                    {status === 2 && (
                        <button
                            className="flex items-center space-x-1 p-2 gap-2 rounded hover:bg-hover"
                            onClick={() => onChangeOverlay("pair")}
                        >
                            <LinkIcon className="h-5 w-5" />
                            <Typography variant="h4" className="">
                                Pair Device
                            </Typography>
                        </button>
                    )}
                </div>

                {/* Right: Desktop ConnectionButton and Mobile Hamburger */}
                <div className="flex items-center space-x-3">
                    {/* Desktop */}
                    <div className="hidden lg:block">
                        <ConnectionButton connected={status} />
                    </div>

                    {/* Mobile Hamburger */}
                    <div className="lg:hidden">
                        <button
                            onClick={() => setIsOpen(!isOpen)}
                            className={`p-2 rounded hover:bg-hover focus:outline-none focus:ring-2 focus:ring-inset focus:ring-text border border-2 ${borderClass}`}
                            aria-label="Toggle menu"
                        >
                            {isOpen ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Dropdown Menu */}
            {isOpen && (
                <div className="lg:hidden flex flex-col space-y-2 px-4 pb-4">
                    <button
                        disabled={status === 2}
                        className={`flex items-center space-x-1 px-3 py-2 gap-1 rounded disabled:text-hover disabled:hover:bg-transparent ${
                            activeView === "live" ? "bg-hover" : "hover:bg-hover"
                        }`}
                        onClick={() => {
                            onNavigate("live");
                            setIsOpen(false);
                        }}
                    >
                        <PlayIcon className="h-5 w-5" />
                        <span>Live Capture</span>
                    </button>

                    <button
                        disabled={status === 2}
                        className={`flex items-center space-x-1 px-3 py-2 gap-1 rounded hover:bg-hover disabled:text-hover disabled:hover:bg-transparent ${
                            activeView === "paste" ? "bg-hover" : "hover:bg-hover"
                        }`}
                        onClick={() => {
                            onNavigate("paste");
                            setIsOpen(false);
                        }}
                    >
                        <ClipboardIcon className="h-5 w-5" />
                        <span>Paste</span>
                    </button>

                    <button
                        disabled={false}
                        className="flex items-center space-x-1 px-3 py-2 gap-1 rounded hover:bg-hover"
                        onClick={() => {
                            onChangeOverlay("quickstart");
                            setIsOpen(false);
                        }}
                    >
                        <PlayCircleIcon className="h-5 w-5" />
                        <span>Quick Start</span>
                    </button>

                    {status === 2 && (
                        <button
                            className="flex items-center space-x-1 px-3 py-2 rounded hover:bg-hover"
                            onClick={() => {
                                onChangeOverlay("pair");
                                setIsOpen(false);
                            }}
                        >
                            <LinkIcon className="h-5 w-5" />
                            <span>Pair Device</span>
                        </button>
                    )}

                    <ConnectionButton connected={status} />
                </div>
            )}
        </div>
    );
}
