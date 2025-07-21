import React, { useState, useContext } from "react";
import "./index.css";
import "./styles/global.css"; // Ensure global styles are applied
import { Sidebar, SidebarWithLogo } from "./components/Sidebar/Sidebar";
import BulkSend from "./views/BulkSend";
import LiveCapture from "./views/LiveCapture";
import { BLEProvider } from "./context/BLEContext";
import ECDHOverlay from "./components/ECDHOverlay/ECDHOverlay";
import { ECDHContext, ECDHProvider } from "./context/ECDHContext";

import ToothPaste from "./assets/ToothPaste.png";
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

function App() {
    const [showOverlay, setShowOverlay] = useState(false);
    const [showSidebar, setshowSidebar] = useState(true);
    const [activeView, setActiveView] = useState("paste"); // control view here

    const renderView = () => {
        switch (activeView) {
            case "paste":
                return <BulkSend />;
            case "live":
                return <LiveCapture />;
            default:
                return <BulkSend />;
        }
    };

    return (
    <ECDHProvider>
      <BLEProvider setShowOverlay={setShowOverlay} showOverlay={showOverlay}>
        <div className="flex flex-col min-h-screen max-h-screen ">
          
          {/* Navbar with hamburger toggle */}
          <SidebarWithLogo
            showSidebar={showSidebar}
            setShowSidebar={setshowSidebar}
            onNavigate={setActiveView}
            onOpenPairing={() => setShowOverlay(true)}
            activeView={activeView}
          />

          {/* Main content area */}
          <main className="flex flex-col flex-1 overflow-auto min-h-0">
            {renderView()}
          </main>

          {/* Overlay */}
          <ECDHOverlay showOverlay={showOverlay} setShowOverlay={setShowOverlay} />
        </div>
      </BLEProvider>
    </ECDHProvider>
    );
    // return (
    //     <ECDHProvider>
    //         <BLEProvider setShowOverlay={setShowOverlay} showOverlay={showOverlay}>
    //             <div className="flex flex-1 min-h-screen max-h-screen">
    //                 <div onClick={() => setshowSidebar(!showSidebar)} className="mb-2 flex items-center gap-1 p-4">
    //                     <img src={ToothPaste} alt="brand" className="h-12 w-12 p-0" />
    //                     <Typography variant="h3" color="text">
    //                         'ToothPaste
    //                     </Typography>
    //                 </div>
    //                 <div className={`fixed top-0 left-0 h-full z-40 transition-transform duration-300 ease-in-out
    //                     ${showSidebar ? "translate-x-0" : "-translate-x-full"}`}
    //                 >
    //                     <SidebarWithLogo
    //                         onOpenPairing={() => setShowOverlay(true)}
    //                         onNavigate={setActiveView}
    //                         activeView={activeView}
    //                     />
    //                 </div>
    //                 {renderView()} {/* The page that is displayed*/}
    //                 <ECDHOverlay showOverlay={showOverlay} setShowOverlay={setShowOverlay} /> {/*Pairing Overlay*/}
    //             </div>
    //         </BLEProvider>
    //     </ECDHProvider>
    // );
}

export default App;
