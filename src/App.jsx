import React, { useState, useContext, useEffect } from "react";
import "./styles/index.css";
//import "./styles/global.css"; // Ensure global styles are applied
import Navbar from "./components/Navigation/Navbar";
import BulkSend from "./views/BulkSend";
import LiveCapture from "./views/LiveCapture";
import { BLEProvider } from "./context/BLEContext";
import ECDHOverlay from "./components/overlays/ECDHOverlay";
import UpdateController from "./components/overlays/UpdateOverlay";
import QuickStartOverlay from "./components/overlays/QuickStartOverlay";
import { ECDHContext, ECDHProvider } from "./context/ECDHContext";
import About from "./views/about/About";

import ToothPaste from "./assets/ToothPaste.png";

function App() {
    const [showOverlay, setShowOverlay] = useState(false);
    const [showNavbar, setshowNavbar] = useState(true);
    const [activeView, setActiveView] = useState("live"); // control view here
    const [activeOverlay, setActiveOverlay] = useState(null); // 'ecdh', 'pairing', etc.
    const [overlayProps, setOverlayProps] = useState({});
  
    const overlays = {
      pair: ECDHOverlay,
      update: UpdateController,
      quickstart: QuickStartOverlay,
    };

    const ActiveOverlay = activeOverlay ? overlays[activeOverlay] : null;

    useEffect(() => {
      const hasSeenQuickstart = localStorage.getItem('quickstart_viewed');
      if (!hasSeenQuickstart) {
        setActiveOverlay('quickstart');
      }
    }, []);

    const renderView = () => {
        switch (activeView) {
            case "paste":
                return <BulkSend />;
            case "live":
                return <LiveCapture />;
            case "about":
                return <About />;
            default:
                return <BulkSend />;
        }
    };

    return (
    <ECDHProvider>
      <BLEProvider setShowOverlay={setShowOverlay} showOverlay={showOverlay}>
        <div className="flex flex-col h-dvh overflow-hidden">
          
          {/* Navbar with hamburger toggle */}
          <Navbar
            showNavbar={showNavbar}
            setshowNavbar={setshowNavbar}
            onNavigate={setActiveView}
            onChangeOverlay={setActiveOverlay}
            activeOverlay={activeOverlay}
            activeView={activeView}
          />

          {/* Main content area */}
          <main className="flex flex-col flex-1 overflow-auto min-h-0">
            {renderView()}
          </main>

          {/* Overlay */}
          {ActiveOverlay && (
            <ActiveOverlay 
              {...overlayProps} 
              onChangeOverlay={setActiveOverlay}
              activeView={activeView}
            />
          )}
        </div>
      </BLEProvider>
    </ECDHProvider>
    );
}

export default App