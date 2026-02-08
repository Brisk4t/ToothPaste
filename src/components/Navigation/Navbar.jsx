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
import { isUnlocked } from "../../services/EncryptedStorage";
import AuthenticationOverlay from "../overlays/AuthenticationOverlay";
import ToothPaste from "../../assets/ToothPaste.png";
import { createRenamePacket } from "../../services/packetService/packetFunctions";

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
function ConnectionButton({ showAuthOverlay, setShowAuthOverlay }) {
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
            [ConnectionStatus.disconnected]: "border-secondary",
            [ConnectionStatus.ready]: "border-primary",
            [ConnectionStatus.connected]: "border-orange",
            [ConnectionStatus.unsupported]: "border-orange",
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
            // Check if authenticated before connecting
            if (!status || status === ConnectionStatus.disconnected) {
                if (!isUnlocked()) {
                    setShowAuthOverlay(true);
                    return;
                }
            }
            clickFn?.(); // only run click if long press didn't trigger
        }
    };

    return (
        <div className="flex justify-left w-full">
            <Button
                id="connection-button"
                title="Click to connect to a device, hold to rename it."
                className={`flex flex-col items-center justify-center w-full p-4 border-2 ${borderClass} bg-transparent hover:border-text min-h-10`}
                style={{
                    backgroundImage: `linear-gradient(to right, rgba(79, 172, 254, 0.2) 0%, rgba(79, 172, 254, 0.2) ${progress}%, transparent ${progress}%, transparent 100%)`,
                    backgroundRepeat: 'no-repeat',
                    transition: 'background-image 0.016s linear'
                }}
                onMouseDown={() => {if (device && status === ConnectionStatus.ready) handleStart(() => setIsEditing(true));}}
                onMouseLeave={() => {handleEnd(cancel);}}
                onMouseUp={() => handleEnd(() => connectToDevice())}
                onTouchStart={() => {if (device && status === ConnectionStatus.ready) handleStart(() => setIsEditing(true));}}
                onTouchCancel={() => {handleEnd(cancel);}}
                onTouchEnd={() => handleEnd(() => connectToDevice())}
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
                    {status !== ConnectionStatus.disconnected && <SignalIcon className="h-5 w-5" />}
                    {status === ConnectionStatus.disconnected && <SignalSlashIcon className="h-5 w-5" />}
                </div>
            </Button>
        </div>
    );
}

export default function Navbar({ onChangeOverlay, onNavigate, activeView, activeOverlay }) {
    const [open, setOpen] = React.useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const [showAuthOverlay, setShowAuthOverlay] = useState(false);
    const { status, device, connectToDevice } = useBLEContext();

    const borderClass =
        {
            [ConnectionStatus.disconnected]: "border-secondary",
            [ConnectionStatus.ready]: "border-primary",
            [ConnectionStatus.connected]: "border-orange",
            [ConnectionStatus.unsupported]: "border-orange",
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
        <>
        <div id="navbar" className="w-full bg-shelf text-white">
            <div className="relative flex justify-between h-24 items-center px-4">
                {/* Left: Logo */}
                <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setIsOpen(false)}>
                    <img src={ToothPaste} alt="ToothPaste" className="h-10 w-10" />
                    <Typography variant="h3" color="text" className="select-none">
                        ToothPaste
                    </Typography>
                </div>

                {/* Center: Desktop menu */}
                <div className="hidden xl:flex absolute left-1/2 transform -translate-x-1/2 space-x-5 items-center">
                    <div className="flex items-center space-x-5">
                        <button
                            disabled={status === ConnectionStatus.connected || status === ConnectionStatus.unsupported}
                            className={`flex items-center space-x-1 p-2 gap-2 rounded disabled:text-hover disabled:hover:bg-transparent ${
                                activeView === "live" ? "disabled:border-hover border border-text" : "hover:bg-hover"
                            }`}
                            onClick={() => onNavigate("live")}
                        >
                            <PlayIcon className="h-5 w-5" />
                            <Typography variant="h4">Live Capture</Typography>
                        </button>

                        <button
                            disabled={status === ConnectionStatus.connected || status === ConnectionStatus.unsupported}
                            className={`flex items-center space-x-1 p-2 gap-2 rounded disabled:text-hover disabled:hover:bg-transparent ${
                                activeView === "paste" ? "disabled:border-hover border border-text" : "hover:bg-hover"
                            }`}
                            onClick={() => onNavigate("paste")}
                        >
                            <ClipboardIcon className="h-5 w-5" />
                            <Typography variant="h4">Paste</Typography>
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
                    </div>

                    {/* Vertical Separator */}
                    <div className="h-6 border-l border-text opacity-50"></div>

                    <div className="flex items-center space-x-5">
                        <button
                            disabled={status === ConnectionStatus.connected}
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

                        {status === ConnectionStatus.connected && (
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
                </div>

                {/* Right: Desktop ConnectionButton and Mobile Hamburger */}
                <div className="flex items-center space-x-3">
                    {/* Desktop */}
                    <div className="hidden xl:block">
                        <ConnectionButton 
                            showAuthOverlay={showAuthOverlay}
                            setShowAuthOverlay={setShowAuthOverlay}
                        />
                    </div>

                    {/* Mobile Hamburger */}
                    <button
                        id="navbar-toggle"
                        onClick={() => setIsOpen(!isOpen)}
                        className={`xl:hidden flex items-center space-x-2 px-3 py-2 rounded hover:bg-hover border border-2 ${borderClass} focus:outline-none`}
                        aria-label="Toggle menu"
                    >
                        <div className="flex flex-col flex-1 min-w-0">
                            <Typography variant="h6" color="text" className="text-sm font-sans font-medium normal-case truncate">
                                {device?.name || "Not Connected"}
                            </Typography>
                        </div>
                        {isOpen ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
                    </button>
                </div>
            </div>

            {/* Mobile Dropdown Menu */}
            {isOpen && (
                <div className="xl:hidden flex flex-col space-y-2 px-4 pb-4">
                    <div className="flex flex-col space-y-2">
                        <button
                            disabled={status === ConnectionStatus.connected || status === ConnectionStatus.unsupported}
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
                            disabled={status === ConnectionStatus.connected || status === ConnectionStatus.unsupported}
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
                            className={`flex items-center space-x-1 px-3 py-2 gap-1 rounded disabled:text-hover disabled:hover:bg-transparent ${
                                activeView === "about" ? "bg-hover" : "hover:bg-hover"
                            }`}
                            onClick={() => {
                                onNavigate("about");
                                setIsOpen(false);
                            }}
                        >
                            <QuestionMarkCircleIcon className="h-5 w-5" />
                            <span>About</span>
                        </button>
                    </div>

                    {/* Horizontal Separator */}
                    <div className="h-px bg-text opacity-50 my-2"></div>

                    <div className="flex flex-col space-y-2">
                        <button
                            disabled={status === ConnectionStatus.connected}
                            className={`flex items-center space-x-1 px-3 py-2 gap-1 rounded disabled:text-hover disabled:hover:bg-transparent ${
                                activeView === "update" ? "bg-hover" : "hover:bg-hover"
                            }`}
                            onClick={() => {
                                onChangeOverlay("update");
                                setIsOpen(false);
                            }}
                        >
                            <CpuChipIcon className="h-5 w-5" />
                            <span>Update</span>
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

                        {status === ConnectionStatus.connected && (
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
                    </div>

                    <ConnectionButton 
                        showAuthOverlay={showAuthOverlay}
                        setShowAuthOverlay={setShowAuthOverlay}
                    />
                </div>
            )}
        </div>

        {showAuthOverlay && (
            <AuthenticationOverlay 
                onAuthSuccess={() => {
                    setShowAuthOverlay(false);
                    connectToDevice();
                }}
                onClose={() => setShowAuthOverlay(false)}
            />
        )}
        </>
    );
}
