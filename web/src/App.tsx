import { useState, useEffect } from "react";
import type { ComponentType } from "react";
import "./styles/index.css";
//import "./styles/global.css"; // Ensure global styles are applied
import Navbar from "./components/Navigation/Navbar";
import BulkSend from "./views/BulkSend";
import LiveCapture from "./views/LiveCapture";
import { BLEProvider } from "./context/BLEContext";
import ECDHOverlay from "./components/overlays/ECDHOverlay";
import UpdateController from "./components/overlays/UpdateOverlay";
import QuickStartOverlay from "./components/overlays/QuickStartOverlay";
import GridBackground from './components/shared/GridBackground';
import { ECDHProvider } from "./context/ECDHContext";
import { DuckyscriptProvider } from "./context/DuckyscriptContext";
import About from "./views/about/About";

function App() {
    const [activeView, setActiveView] = useState("live"); // control view here
    const [activeOverlay, setActiveOverlay] = useState<string | null>(null); // 'ecdh', 'pairing', etc.
    const [overlayProps, setOverlayProps] = useState<Record<string, unknown>>({});

    // Each overlay component only actually consumes a subset of what's spread below
    // (e.g. ECDHOverlay/UpdateController ignore `activeView`, QuickStartOverlay uses it) —
    // cast to a loose component type at the render site rather than widening each
    // overlay's own prop types to accept props they don't use.
    const overlays: Record<string, ComponentType<any>> = {
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
    <DuckyscriptProvider>
      <ECDHProvider>
        <BLEProvider>
          <div className="flex flex-col h-dvh overflow-hidden bg-background relative">
            {/* Navbar - top layer */}
            <Navbar
              onNavigate={setActiveView}
              onChangeOverlay={setActiveOverlay}
              activeOverlay={activeOverlay}
              activeView={activeView}
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
                onChangeOverlay={setActiveOverlay}
                activeView={activeView}
              />
            )}
          </div>
        </BLEProvider>
      </ECDHProvider>
    </DuckyscriptProvider>
    );
}

export default App
