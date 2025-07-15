import React, { useState, useContext } from 'react';
import './index.css';
import './styles/global.css'; // Ensure global styles are applied
import {Sidebar, SidebarWithLogo} from './components/Sidebar/Sidebar';
import BulkSend from './views/BulkSend';
import LiveCapture from './views/LiveCapture';
import { BLEProvider } from './context/BLEContext';
import ECDHOverlay from './components/ECDHOverlay/ECDHOverlay';
import { ECDHContext, ECDHProvider } from './context/ECDHContext';


function App() {
  const [showOverlay, setShowOverlay] = useState(false);
  const [activeView, setActiveView] = useState('paste'); // control view here

  const renderView = () => {
    switch (activeView) {
      case 'paste':
        return <BulkSend />;
      case 'live':
        return <LiveCapture />;
      default:
        return <BulkSend />;
    }
  };

  return (
    <ECDHProvider>
      <BLEProvider setShowOverlay={setShowOverlay} showOverlay={showOverlay}>
          <div className="flex flex-1 min-h-screen max-h-screen">
            <SidebarWithLogo onOpenPairing={() => setShowOverlay(true)} onNavigate={setActiveView} activeView={activeView}/>
            {renderView()}
            <ECDHOverlay showOverlay={showOverlay} setShowOverlay={setShowOverlay} />
          </div>
      </BLEProvider>
    </ECDHProvider>
  );
}

export default App;
