import React, { useState, useContext } from 'react';
import './index.css';
import './styles/global.css'; // Ensure global styles are applied
import {Sidebar, SidebarWithLogo} from './components/Sidebar/Sidebar';
import BulkSend from './views/BulkSend';
import { BLEProvider } from './context/BLEContext';
import ECDHOverlay from './components/ECDHOverlay/ECDHOverlay';
import { ECDHContext, ECDHProvider } from './context/ECDHContext';


function App() {
  const [showOverlay, setShowOverlay] = useState(false);

  return (
      <BLEProvider>
        <ECDHProvider>
          <div className="flex flex-1 min-h-screen max-h-screen">
            <SidebarWithLogo onOpenPairing={() => setShowOverlay(true)}/>
            <BulkSend />
            <ECDHOverlay showOverlay={showOverlay} setShowOverlay={setShowOverlay} />
          </div>
        </ECDHProvider>
      </BLEProvider>
  );
}

export default App;
