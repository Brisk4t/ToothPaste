import React, { createContext } from "react";

/**
 * ECDHContext — stub kept for backward compatibility.
 * All crypto and key management is now handled by BLEManager + SessionManager
 * in client/core/. This context no longer does any work.
 */
export const ECDHContext = createContext({});

export const ECDHProvider = ({ children }) => (
    <ECDHContext.Provider value={{}}>
        {children}
    </ECDHContext.Provider>
);
