import React, { useState, useContext } from 'react';
import './index.css';
import './styles/global.css'; // Ensure global styles are applied
import {Sidebar, SidebarWithLogo} from './components/Sidebar/Sidebar';
import BulkSend from './views/BulkSend';
import { BLEProvider } from './context/BLEContext';

function App() {
  return (
      <BLEProvider>
        <div className="flex flex-1 min-h-screen">
          <SidebarWithLogo />
          <BulkSend />
        </div>
      </BLEProvider>
  );
}

export default App;
