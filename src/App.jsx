import React, { useState, useContext } from "react";
import "./index.css";
import "./styles/global.css"; // Ensure global styles are applied
import Navbar from "./components/Navigation/Navbar";
import BulkSend from "./views/BulkSend";
import LiveCapture from "./views/LiveCapture";
import { BLEProvider } from "./context/BLEContext";
import ECDHOverlay from "./components/ECDHOverlay/ECDHOverlay";
import UpdateController from "./components/UpdateComponent/UpdateController";
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
    const [showNavbar, setshowNavbar] = useState(true);
    const [activeView, setActiveView] = useState("live"); // control view here
    const [activeOverlay, setActiveOverlay] = useState(null); // 'ecdh', 'pairing', etc.
    const [overlayProps, setOverlayProps] = useState({});
  
    const overlays = {
      pair: ECDHOverlay,
      update: UpdateController,
    };

    const ActiveOverlay = activeOverlay ? overlays[activeOverlay] : null;

    const renderView = () => {
        switch (activeView) {
            case "paste":
                return <BulkSend />;
            case "live":
                return <LiveCapture />;
            // case "update":
            //     return <UpdateController />;
            default:
                return <BulkSend />;
        }
    };

    return (
    <ECDHProvider>
      <BLEProvider setShowOverlay={setShowOverlay} showOverlay={showOverlay}>
        <div className="flex flex-col min-h-screen max-h-screen ">
          
          {/* Navbar with hamburger toggle */}
          <Navbar
            showNavbar={showNavbar}
            setshowNavbar={setshowNavbar}
            onNavigate={setActiveView}
            onChangeOverlay={setActiveOverlay}
            activeView={activeView}
          />

          {/* Main content area */}
          <main className="flex flex-col flex-1 overflow-auto min-h-0">
            {renderView()}
          </main>

          {/* Overlay */}
          {ActiveOverlay && (
            <ActiveOverlay {...overlayProps} onChangeOverlay={setActiveOverlay} />
          )}
        </div>
      </BLEProvider>
    </ECDHProvider>
    );
}

export default App