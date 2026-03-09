import React, { useState, useEffect } from 'react';
import { Typography } from "@material-tailwind/react";
import { SignalIcon, XMarkIcon } from '@heroicons/react/24/outline';

const BLEDevicePickerOverlay = ({ onClose }) => {
    const [devices, setDevices] = useState([]);
    const [scanStatus, setScanStatus] = useState('scanning'); // 'scanning' | 'timeout' | 'cancelled'
    const [selecting, setSelecting] = useState(null);

    useEffect(() => {
        if (!window.toothpasteBLE) return;

        window.toothpasteBLE.onDeviceList((deviceList) => {
            setDevices(deviceList);
        });

        window.toothpasteBLE.onScanStatus((status) => {
            setScanStatus(status);
        });
    }, []);

    const handleSelect = (deviceId) => {
        setSelecting(deviceId);
        window.toothpasteBLE?.selectDevice(deviceId);
        onClose();
    };

    const handleCancel = () => {
        window.toothpasteBLE?.cancelScan();
        onClose();
    };

    return (
        <div
            className="fixed inset-0 bg-black/70 flex flex-col justify-center items-center z-[9999]"
            onClick={handleCancel}
        >
            <div
                className="bg-ink border border-ash rounded-xl w-11/12 max-w-sm flex flex-col shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                    <Typography variant="h5" className="text-text font-header normal-case font-semibold">
                        Select Device
                    </Typography>
                    <button
                        onClick={handleCancel}
                        className="text-dust hover:text-text transition-colors"
                    >
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>

                {/* Scanning indicator */}
                <div className="flex items-center gap-2 px-5 pb-3">
                    {scanStatus === 'scanning' ? (
                        <>
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                            </span>
                            <Typography variant="small" className="text-dust font-body normal-case">
                                Scanning for devices…
                            </Typography>
                        </>
                    ) : scanStatus === 'timeout' ? (
                        <Typography variant="small" className="text-secondary font-body normal-case">
                            Scan timed out. No devices found.
                        </Typography>
                    ) : null}
                </div>

                {/* Device list */}
                <div className="flex flex-col px-3 pb-3 gap-1 max-h-64 overflow-y-auto">
                    {devices.length === 0 && scanStatus === 'scanning' && (
                        <div className="text-center py-6 text-dust text-sm font-body">
                            Make sure your ToothPaste device is powered on and nearby.
                        </div>
                    )}
                    {devices.map((device) => (
                        <button
                            key={device.deviceId}
                            onClick={() => handleSelect(device.deviceId)}
                            disabled={!!selecting}
                            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-ash transition-colors text-left disabled:opacity-50"
                        >
                            <SignalIcon className="h-5 w-5 text-primary shrink-0" />
                            <div className="flex flex-col min-w-0">
                                <span className="text-text font-body text-sm truncate">
                                    {device.deviceName}
                                </span>
                                <span className="text-dust font-body text-xs truncate">
                                    {device.deviceId}
                                </span>
                            </div>
                            {selecting === device.deviceId && (
                                <span className="ml-auto text-primary text-xs font-body">Connecting…</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-ash">
                    <button
                        onClick={handleCancel}
                        className="w-full py-2 rounded-lg border border-ash text-dust hover:text-text hover:border-graphite transition-colors font-body text-sm"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BLEDevicePickerOverlay;
