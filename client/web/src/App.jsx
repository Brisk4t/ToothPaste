import React, { useState, useContext, useEffect } from "react";
import "./styles/index.css";
//import "./styles/global.css"; // Ensure global styles are applied
import Navbar from "./components/Navigation/Navbar";
import BulkSend from "./views/BulkSend";
import LiveCapture from "./views/LiveCapture";
import { BLEProvider } from "./context/BLEContext";
import { useBLEContext } from "./context/BLEContext";
import ECDHOverlay from "./components/overlays/ECDHOverlay";
import UpdateController from "./components/overlays/UpdateOverlay";
import QuickStartOverlay from "./components/overlays/QuickStartOverlay";
import BLEDevicePickerOverlay from "./components/overlays/BLEDevicePickerOverlay";
import GridBackground from './components/shared/GridBackground';
import { ECDHContext, ECDHProvider } from "./context/ECDHContext";
import { DuckyscriptProvider } from "./context/DuckyscriptContext";
import About from "./views/about/About";
import { useMCPBridge } from "./services/mcpBridge/useMCPBridge";

import ToothPaste from "./assets/ToothPaste.png";
import { Grid } from "@react-three/drei";

/**
 * AppContent component wraps the main content and initializes MCP Bridge
 * This must be inside BLEProvider to use useBLEContext
 */
function AppContent({
  showNavbar,
  setshowNavbar,
  onNavigate,
  onChangeOverlay,
  activeOverlay,
  activeView,
  renderView,
  overlayProps
}) {
  // Initialize MCP bridge (Electron only, safe no-op in browser)
  useMCPBridge();

  const { showDevicePicker, setShowDevicePicker } = useBLEContext();

  const overlays = {
    pair: ECDHOverlay,
    update: UpdateController,
    quickstart: QuickStartOverlay,
  };

  const ActiveOverlay = activeOverlay ? overlays[activeOverlay] : null;

  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-background relative">
      {/* Navbar - top layer */}
      <Navbar
        showNavbar={showNavbar}
        setshowNavbar={setshowNavbar}
        onNavigate={onNavigate}
        onChangeOverlay={onChangeOverlay}
        activeOverlay={activeOverlay}
        activeView={activeView}
        className="relative z-50"
      />

      {/* Main content area - middle layer */}
      <main className="flex flex-col flex-1 overflow-auto min-h-0 relative z-0 bg-transparent">
        {renderView()}
        <GridBackground
          filledSquares={[]}
          squareSize={25}
          borderColor="rgba(255, 255, 255, 0.1)"
          borderWidth={1}
          className="z-0"
        />
      </main>

      {/* Overlay */}
      {ActiveOverlay && (
        <ActiveOverlay 
          {...overlayProps} 
          onChangeOverlay={onChangeOverlay}
          activeView={activeView}
        />
      )}

      {/* BLE Device Picker (Electron only) */}
      {showDevicePicker && (
        <BLEDevicePickerOverlay onClose={() => setShowDevicePicker(false)} />
      )}
    </div>
  );
}

function App() {
    const [showOverlay, setShowOverlay] = useState(false);
    const [showNavbar, setshowNavbar] = useState(true);
    const [activeView, setActiveView] = useState("live"); // control view here
    const [activeOverlay, setActiveOverlay] = useState(null); // 'ecdh', 'pairing', etc.
    const [overlayProps, setOverlayProps] = useState({});
  
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
    <DuckyscriptProvider>
      <ECDHProvider>
        <BLEProvider setShowOverlay={setShowOverlay} showOverlay={showOverlay}>
          <AppContent
            showNavbar={showNavbar}
            setshowNavbar={setshowNavbar}
            onNavigate={setActiveView}
            onChangeOverlay={setActiveOverlay}
            activeOverlay={activeOverlay}
            activeView={activeView}
            overlayProps={overlayProps}
            renderView={renderView}
          />
        </BLEProvider>
      </ECDHProvider>
    </DuckyscriptProvider>
    );
}

export default App