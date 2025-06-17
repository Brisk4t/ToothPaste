import React, { useState, useContext } from 'react';
import './index.css';
import './styles/global.css'; // Ensure global styles are applied
import {Sidebar, SidebarWithLogo} from './components/Sidebar/Sidebar';
import BulkSend from './views/BulkSend';
import { BLEProvider } from './context/BLEContext';
import ECDHComponent from './context/SecurityContext';


function App() {
  const [showOverlay, setShowOverlay] = useState(false);

  return (
      <BLEProvider>
        <div className="flex flex-1 min-h-screen max-h-screen">
          <SidebarWithLogo onOpenPairing={() => setShowOverlay(true)}/>
          <BulkSend />
          <ECDHComponent showOverlay={showOverlay} setShowOverlay={setShowOverlay} />
        </div>
      </BLEProvider>
  );
}

export default App;
