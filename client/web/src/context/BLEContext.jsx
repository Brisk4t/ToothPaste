import React, {
    createContext,
    useContext,
    useState,
    useRef,
    useMemo,
    useEffect,
} from "react";
import { keyExists, loadBase64 } from "../services/localSecurity/EncryptedStorage.js";
import { keyboardHandler } from "../services/inputHandlers/keyboardHandler.js";
import { mouseHandler } from "../services/inputHandlers/mouseHandler.js";
import { create, toBinary, fromBinary } from "@bufbuild/protobuf";

// Core library imports
import { 
    BLEManager, 
    SessionManager, 
    PacketHandler, 
    WebBLEAdapter 
} from "../../../core/index.js";
import * as ToothPacketPB from '../services/packetService/toothpacket/toothpacket_pb.js';

// Storage adapter bridge for SessionManager
class EncryptedStorageAdapter {
    async save(deviceId, key, value) {
        return new Promise((resolve, reject) => {
            try {
                // Use the existing EncryptedStorage service
                // This is a simplified wrapper; adjust as needed for your storage interface
                localStorage.setItem(`${deviceId}:${key}`, value);
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }

    async load(deviceId, key) {
        return localStorage.getItem(`${deviceId}:${key}`);
    }

    async exists(deviceId, key) {
        return localStorage.getItem(`${deviceId}:${key}`) !== null;
    }
}

export const BLEContext = createContext();
export const useBLEContext = () => useContext(BLEContext);
export const supportedFirmwareVersions = ["0.9.0^"];

export const ConnectionStatus = {
        disconnected: 0,
        ready: 1,
        connected: 2,
        unsupported: 3,
        scanning: 4
};

export function BLEProvider({ children }) {
    // ========== Core Library Initialization ==========
    const bleManagerRef = useRef(null);
    
    // Initialize core library on mount
    useEffect(() => {
        if (bleManagerRef.current) return;

        // Create core components
        const adapter = new WebBLEAdapter();
        const storageAdapter = new EncryptedStorageAdapter();
        const sessionManager = new SessionManager(storageAdapter);
        const packetHandler = new PacketHandler(ToothPacketPB, { create, toBinary, fromBinary });

        // Create BLEManager (sessionManager, packetHandler, bleAdapter)
        const manager = new BLEManager(sessionManager, packetHandler, adapter);

        bleManagerRef.current = manager;
    }, []);

    // ========== React State ==========
    const [status, setStatus] = React.useState(ConnectionStatus.disconnected);
    const [device, setDevice] = useState(null);
    const [server, setServer] = useState(null);
    const [pktCharacteristic, setpktCharacteristic] = useState(null);
    const [showDevicePicker, setShowDevicePicker] = useState(false);
    const [challengeSalt, setChallengeSalt] = useState(null);
    const readyToReceive = useRef({ promise: null, resolve: null });

    // ========== Core Manager Event Listeners ==========
    useEffect(() => {
        if (!bleManagerRef.current) return;

        const manager = bleManagerRef.current;

        // Map core status to React state
        manager.on('status', (status) => {
            setStatus(status);
        });

        // Map device info
        manager.on('device', (deviceInfo) => {
            setDevice({
                name: deviceInfo.name,
                macAddress: deviceInfo.mac,
                gatt: { connected: true },
            });
            setpktCharacteristic(manager.packetCharacteristic);
            setServer(manager.server);
        });

        // Handle disconnect
        manager.on('disconnect', () => {
            setDevice(null);
            setpktCharacteristic(null);
            setServer(null);
        });

        // Handle serialData (forward to any listeners)
        manager.on('serialData', (data) => {
            if (window.ipcRenderer) {
                window.ipcRenderer.send('device:serialData', data);
            }
        });

        // CHALLENGE: firmware derived AES key with sessionSalt — expose so ECDHOverlay can finalize auth
        manager.on('challenge', (sessionSalt) => {
            setChallengeSalt(sessionSalt);
        });

        // PEER_UNKNOWN: firmware doesn’t recognise the stored public key — clear challenge state
        manager.on('peerUnknown', () => {
            setChallengeSalt(null);
        });

        // In Electron, listen for scan status updates
        if (window.toothpasteBLE?.onScanStatus) {
            window.toothpasteBLE.onScanStatus((scanStatus) => {
                if (scanStatus === 'scanning') setStatus(ConnectionStatus.scanning);
                else if (scanStatus === 'timeout') { 
                    setStatus(ConnectionStatus.disconnected); 
                    setShowDevicePicker(false); 
                }
                else if (scanStatus === 'cancelled') { 
                    setStatus(ConnectionStatus.disconnected); 
                    setShowDevicePicker(false); 
                }
            });
        }
    }, []);

    // ========== Connection Methods ==========
    const connectToDevice = async () => {
        try {
            if (!bleManagerRef.current) return;
            
            setStatus(ConnectionStatus.scanning);
            
            // In Electron, show the custom picker
            if (window.toothpasteBLE) {
                setShowDevicePicker(true);
            }
            
            // Connect via core manager
            await bleManagerRef.current.connect();
        } catch (error) {
            console.error("[BLEContext] Connection failed:", error);
            setShowDevicePicker(false);
            if (!device || !device.gatt?.connected) {
                setStatus(ConnectionStatus.disconnected);
            }
        }
    };

    const pairDevice = async () => {
        try {
            if (!bleManagerRef.current) {
                throw new Error('BLE Manager not initialized');
            }
            
            await bleManagerRef.current.pair();
        } catch (error) {
            console.error("[BLEContext] Pairing failed:", error);
            throw error;
        }
    };

    // Called by ECDHOverlay after it has derived the session AES key from the CHALLENGE salt.
    // Passes the key into BLEManager so sendEncryptedPackets can encrypt correctly.
    const completeAuth = (aesKey) => {
        if (!bleManagerRef.current) return;
        bleManagerRef.current.completeAuthentication(aesKey);
        setChallengeSalt(null); // consumed
    };

    // ========== Send Methods (wrapper around core library) ==========
    const sendEncrypted = async (inputPayload, prefix = 0) => {
        if (!bleManagerRef.current || !bleManagerRef.current.isConnected()) {
            console.warn("[BLEContext] Not connected, cannot send");
            return;
        }

        try {
            const payloads = Array.isArray(inputPayload) ? inputPayload : [inputPayload];
            await bleManagerRef.current.sendEncryptedPackets(payloads);
        } catch (error) {
            console.error("[BLEContext] Error sending encrypted packet:", error);
        }
    };

    const sendUnencrypted = async (inputString) => {
        if (!bleManagerRef.current) return;

        try {
            // Create unencrypted packet via core
            const packet = bleManagerRef.current.packetHandler.createUnencryptedPacket(inputString);
            await bleManagerRef.current.bleAdapter.writeCharacteristicWithoutResponse(
                bleManagerRef.current.packetChar,
                packet
            );
        } catch (error) {
            console.error("[BLEContext] Error sending unencrypted packet:", error);
        }
    };

    // ========== Utility Methods ==========
    const getStatusLabel = () => {
        const labels = {
            0: 'disconnected',
            1: 'ready',
            2: 'connected',
            3: 'unsupported',
            4: 'scanning'
        };
        return labels[status] || 'unknown';
    };

    // ========== MCP Bridge Convenience Methods ==========
    const sendString = (text, slowMode = 0) => {
        keyboardHandler.sendKeyboardString(text, sendEncrypted);
    };

    const sendKeyCode = (key, slowMode = 0, modifiers = []) => {
        // Parse key string which can be "ctrl+a", "shift+alt+Delete", etc.
        const parts = key.toLowerCase().split('+');
        let keyName = parts[parts.length - 1];
        const mods = parts.slice(0, -1);

        const modifierMap = {
            'ctrl': 'Control',
            'control': 'Control',
            'alt': 'Alt',
            'shift': 'Shift',
            'meta': 'Meta',
            'win': 'Meta',
            'windows': 'Meta',
            'cmd': 'Meta',
            'command': 'Meta'
        };

        const resolvedMods = mods.map(m => modifierMap[m] || m);

        const keyMap = {
            'enter': 'Enter',
            'return': 'Enter',
            'tab': 'Tab',
            'escape': 'Escape',
            'esc': 'Escape',
            'backspace': 'Backspace',
            'delete': 'Delete',
            'del': 'Delete',
            'space': ' ',
            'arrowup': 'ArrowUp',
            'arrowdown': 'ArrowDown',
            'arrowleft': 'ArrowLeft',
            'arrowright': 'ArrowRight',
        };

        const resolvedKey = keyMap[keyName] || keyName;
        keyboardHandler.sendKeyCode(resolvedKey, resolvedMods, sendEncrypted);
    };

    const sendMouse = (params) => {
        const { action, x = 0, y = 0, button = 'left', delta = 0 } = params;

        switch (action) {
            case 'move':
                mouseHandler.sendMouseReport([{ x, y }], 0, 0, 0, sendEncrypted);
                break;
            case 'click':
                const leftClick = button === 'left' ? 1 : 0;
                const rightClick = button === 'right' ? 1 : 0;
                mouseHandler.sendMouseClick(leftClick, rightClick, sendEncrypted);
                break;
            case 'scroll':
                mouseHandler.sendMouseScroll(delta, sendEncrypted);
                break;
            default:
                console.warn(`Unknown mouse action: ${action}`);
        }
    };

    const sendMediaControl = (action) => {
        const consumerControlMap = {
            'play_pause': 0xCD,
            'next_track': 0xB5,
            'prev_track': 0xB6,
            'volume_up': 0xE9,
            'volume_down': 0xEA,
            'mute_toggle': 0xE2,
            'brightness_up': 0xF8,
            'brightness_down': 0xF7,
        };

        const code = consumerControlMap[action];
        if (!code) {
            console.warn(`Unknown media control action: ${action}`);
            return;
        }

        if (bleManagerRef.current) {
            const packet = bleManagerRef.current.packetHandler.createConsumerControl(code);
            sendEncrypted(packet);
        }
    };

    // ========== Context Value ==========
    const contextValue = useMemo(() => ({
        device,
        server,
        pktCharacteristic,
        status,
        showDevicePicker,
        setShowDevicePicker,
        challengeSalt,
        completeAuth,
        firmwareVersion: device?.firmwareVersion || null,
        connectToDevice,
        pairDevice,
        readyToReceive,
        sendEncrypted,
        sendUnencrypted,
        // MCP Bridge convenience methods
        sendString,
        sendKeyCode,
        sendMouse,
        sendMediaControl,
        getStatusLabel,
    }), [device, server, pktCharacteristic, status, challengeSalt, connectToDevice, pairDevice, readyToReceive, sendEncrypted, sendUnencrypted, sendString, sendKeyCode, sendMouse, sendMediaControl, getStatusLabel]);

    return (
        <BLEContext.Provider value={contextValue}>
            {children}
        </BLEContext.Provider>
    );
}


/**
 * Check if a device firmware version is compatible with supported versions.
 * Supports exact matches, caret versions (^), and suffix validation.
 * @param {string} deviceFirmwareVersion - Device version string
 * @param {string[]} supportedFirmwareVersions - List of supported versions
 * @returns {boolean} True if version is supported
 */
export function isVersionCompatible(deviceFirmwareVersion, supportedFirmwareVersions = []) {
    const versionMatch = deviceFirmwareVersion.match(/^(\d+\.\d+\.\d+)(.*)/);
    
    if (!versionMatch) {
        console.error("Invalid firmware version format:", deviceFirmwareVersion);
        return false;
    }
    
    const baseVersion = versionMatch[1];
    const suffix = versionMatch[2];
    
    if (supportedFirmwareVersions.includes(deviceFirmwareVersion)) {
        return true;
    }
    
    if (suffix && !supportedFirmwareVersions.includes(suffix)) {
        return false;
    }
    
    if (supportedFirmwareVersions.includes(baseVersion)) {
        return true;
    }
    
    for (const supportedVersion of supportedFirmwareVersions) {
        if (supportedVersion.endsWith('^')) {
            const supportedBase = supportedVersion.slice(0, -1);
            if (isVersionGreaterOrEqual(baseVersion, supportedBase)) {
                return true;
            }
        }
    }
    
    return false;
}

/**
 * Compare semantic versions (x.y.z format)
 * @param {string} version1 - First version to compare
 * @param {string} version2 - Second version to compare
 * @returns {boolean} True if version1 >= version2
 */
function isVersionGreaterOrEqual(version1, version2) {
    const v1 = version1.split('.').map(Number);
    const v2 = version2.split('.').map(Number);
    
    for (let i = 0; i < 3; i++) {
        if (v1[i] > v2[i]) return true;
        if (v1[i] < v2[i]) return false;
    }
    
    return true;
}
