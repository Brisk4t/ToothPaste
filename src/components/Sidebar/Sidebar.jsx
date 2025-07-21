import React, { useState } from "react";
import {
    IconButton,
    Badge,
    Card,
    Typography,
    List,
    ListItem,
    ListItemPrefix,
    ListItemSuffix,
    Chip,
    Accordion,
    AccordionHeader,
    AccordionBody,
    Alert,
    Button,
} from "@material-tailwind/react";
import {
    HomeIcon,
    ChevronRightIcon,
    Bars3Icon,
    XMarkIcon,
    ClipboardIcon,
    PlayIcon,
    LinkIcon,
    ArrowPathIcon,
    SignalSlashIcon,
    SignalIcon,
} from "@heroicons/react/24/outline";

import { useBLEContext } from "../../context/BLEContext";
import ToothPaste from "../../assets/ToothPaste.png";

// Status icon for a given device
function ConnectionButton() {
    const { connectToDevice, status, device } = useBLEContext();

    const borderClass =
        {
            0: "border-secondary",
            1: "border-primary",
            2: "border-orange", // make sure you defined `border-tertiary` in Tailwind config

        }[status] || "border-orange"; // fallback if undefined

    return (
        <div className="flex justify-left w-full">
            <Button
                className={`flex items-center justify-between w-full p-4 border-2 ${borderClass} bg-transparent hover:border-text`}
                onClick={connectToDevice}
            >
                {/* If a device is connected get its name */}
                <Typography variant="h6" color="text" className="text-lg font-sans font-medium normal-case mr-6">
                    {device ? device.name : "Connect to Device"}
                </Typography>
                
                {/* Change the icon for connected and disconnected states */}
                {(status !== 0 && <SignalIcon className="h-5 y-5"/>)}
                {(status === 0 && <SignalSlashIcon className="h-5 y-5"/>)}
            </Button>
        </div>
    );
}

export function SidebarWithLogo({ onOpenPairing, onNavigate, activeView }) {
    const [open, setOpen] = React.useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const { status, device } = useBLEContext();

    console.log("Status is: ", status);
    return (
        <div className="w-full bg-shelf text-white">
            <div className="flex justify-between h-24 items-center px-4">
                {/* Left: Logo */}
                <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setIsOpen(false)}>
                    <img src={ToothPaste} alt="brand" className="h-10 w-10" />
                    <Typography variant="h3" color="text" className="select-none">
                        'ToothPaste
                    </Typography>
                </div>

                {/* Center: Desktop menu */}
                <div className="hidden md:flex flex-1 justify-center space-x-16">

                    <button
                        className={`flex items-center space-x-1 py-4 px-8 gap-1  rounded ${
                            activeView === "live" ? "border border-text" : "hover:bg-hover"
                        }`}
                        onClick={() => onNavigate("live")}
                    >
                        <PlayIcon className="h-5 w-5" />
                        <Typography variant="h4">Live Capture</Typography>
                    </button>
                    
                    <button
                        className={`flex items-center space-x-1 py-4 px-8 gap-1 rounded ${
                            activeView === "paste" ? "border border-text" : "hover:bg-hover"
                        }`}
                        onClick={() => onNavigate("paste")}
                    >
                        <ClipboardIcon className="h-5 w-5" />
                        <Typography variant="h4">Paste</Typography>
                    </button>

                    {status === 2 && (
                        <button
                            className="flex items-center space-x-1 p-4 gap-2 rounded hover:bg-hover"
                            onClick={onOpenPairing}
                        >
                            <LinkIcon className="h-5 w-5" />
                            <Typography variant="h4">Pair Device</Typography>
                        </button>
                    )}
                </div>

                {/* Right: Desktop ConnectionButton and Mobile Hamburger */}
                <div className="flex items-center space-x-3">
                    {/* Desktop */}
                    <div className="hidden md:block">
                        <ConnectionButton connected={status} />
                    </div>

                    {/* Mobile Hamburger */}
                    <div className="md:hidden">
                        <button
                            onClick={() => setIsOpen(!isOpen)}
                            className="p-2 rounded hover:bg-hover focus:outline-none focus:ring-2 focus:ring-inset focus:ring-text"
                            aria-label="Toggle menu"
                        >
                            {isOpen ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Dropdown Menu */}
            {isOpen && (
                <div className="md:hidden flex flex-col space-y-2 px-4 pb-4">

                    <button
                        className={`flex items-center space-x-1 px-3 py-2 rounded ${
                            activeView === "live" ? "outline-text" : "hover:bg-hover"
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
                        className={`flex items-center space-x-1 px-3 py-2 rounded ${
                            activeView === "paste" ? "outline-text" : "hover:bg-hover"
                        }`}
                        onClick={() => {
                            onNavigate("paste");
                            setIsOpen(false);
                        }}
                    >
                        <ClipboardIcon className="h-5 w-5" />
                        <span>Paste</span>
                    </button>

                    {status === 2 && (
                        <button
                            className="flex items-center space-x-1 px-3 py-2 rounded hover:bg-hover"
                            onClick={() => {
                                onOpenPairing();
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
// export function SidebarWithLogo({ onOpenPairing, onNavigate, activeView }) {
//     const [open, setOpen] = React.useState(0);
//     const [openAlert, setOpenAlert] = React.useState(true);
//     const { status, device } = useBLEContext();

//     const handleOpen = (value) => {
//         setOpen(open === value ? 0 : value);
//     };

//     return (
//         <Card className={"h-full w-full max-w-[20rem] p-3 shadow-xl bg-shelf text-text "}>

//             <List className="text-text gap-4">
//                 <ConnectionButton connected={status} />
//                 <hr className="my-0 border-none" />

//                 <Typography variant="h4" className="mb-0 px-1 text-text"> Actions</Typography>

//                 <ListItem className={`ml-1 ${activeView === "paste" ? "outline-text" : ""}`} onClick={() => onNavigate("paste")}>
//                     <ListItemPrefix>
//                         <ClipboardIcon className="h-5 w-5" />
//                     </ListItemPrefix>
//                     Paste
//                 </ListItem>

//                 <ListItem
//                     className={`ml-1 ${activeView === "live" ? "outline-text" : ""}`} onClick={() => onNavigate("live")}>
//                     <ListItemPrefix>
//                         <PlayIcon className="h-5 w-5" />
//                     </ListItemPrefix>
//                     Live Capture
//                 </ListItem>

//                 {device && (
//                     <ListItem className="ml-1" onClick={onOpenPairing}>
//                         <ListItemPrefix>
//                             <LinkIcon className="h-5 w-5" />
//                         </ListItemPrefix>
//                         Pair Device
//                     </ListItem>
//                 )}
//             </List>
//         </Card>
//     );
// }
