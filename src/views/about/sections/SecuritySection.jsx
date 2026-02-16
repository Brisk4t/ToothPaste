import React from 'react';
import { Typography } from "@material-tailwind/react";
import { ArrowDownIcon, LockClosedIcon, ItalicIcon, 
        EyeIcon, EyeSlashIcon, LightBulbIcon, 
    RssIcon, KeyIcon, LockOpenIcon, CpuChipIcon } from "@heroicons/react/24/outline";
import { appColors } from '../../../styles/colors';

export default function SecuritySection({ currentSlide, getSectionOpacity }) {
    return (
        <section
            className="absolute inset-0 flex flex-col px-6 md:px-12 py-12 z-50 bg-none"
            style={{
                opacity: getSectionOpacity(2),
                transition: 'opacity 0.3s ease-in-out',
                pointerEvents: getSectionOpacity(2) > 0.5 ? 'auto' : 'none',
                '--box-gap': '2rem'
            }}
        >
            {/* Title Row */}
            <div className="flex items-start justify-center gap-4 mb-12 flex-shrink-0">
                {/* <LockClosedIcon className="h-12 w-12 text-primary flex-shrink-0" /> */}
                <Typography type="h2" className="font-header text-text font-bold">
                    So how does it work?
                </Typography>
            </div>

            {/* 50/50 Split Container */}
            <div className="flex-1 flex items-stretch justify-center gap-8 bg-none">
                {/* Left Side */}
                <div className="flex-1 flex flex-col">
                    <Typography type="h4" className="text-lg md:text-2xl font-semibold text-orange mb-4 text-center">
                        The ToothPaste WebApp (this site)
                    </Typography>

                    <div className="flex flex-wrap content-start flex-1 h-full" style={{ gap: 'var(--box-gap)' }}>
                        <div className="flex-shrink-0 flex" style={{ width: 'calc(50% - var(--box-gap))', height: 'calc(50% - var(--box-gap))' }}>
                            <div className="whybox border-orange flex-1">
                                <RssIcon className="h-12 w-12 md:h-16 md:w-16 text-orange flex-shrink-0" 
                                    />
                                <div className="flex flex-col items-center justify-center text-center gap-4 px-4">
                                    <Typography className="font-body text-md md:text-lg font-light text-text leading-relaxed">
                                        Pairs with the ToothPaste Receiver to send keystrokes securely over BLE.
                                    </Typography>
                                </div>
                            </div>
                        </div>
                        <div className="flex-shrink-0 flex" style={{ width: 'calc(50% - var(--box-gap))', height: 'calc(50% - var(--box-gap))' }}>
                            <div className="whybox border-orange flex-1">
                                <LockClosedIcon className="h-12 w-12 md:h-16 md:w-16 text-orange flex-shrink-0" 
                                    />
                                <div className="flex flex-col items-center justify-center text-center gap-4 px-4">
                                    <Typography className="font-body text-md md:text-lg font-light text-text leading-relaxed">
                                        Encrypts keystrokes using ECDSA and sends them as custom ProtoBuf packets.
                                    </Typography>
                                </div>
                            </div>
                        </div>
                        <div className="flex-shrink-0 flex" style={{ width: 'calc(50% - var(--box-gap))', height: 'calc(50% - var(--box-gap))' }}>
                            <div className="whybox border-orange flex-1">
                                <KeyIcon className="h-12 w-12 md:h-16 md:w-16 text-orange flex-shrink-0" 
                                    />
                                <div className="flex flex-col items-center justify-center text-center gap-4 px-4">
                                    <Typography className="font-body text-md md:text-lg font-light text-text leading-relaxed">
                                        Encrypts local data using the Argon2 key derivation function (the same algorithm used by password managers) and never stores keystrokes.
                                    </Typography>
                                </div>
                            </div>
                        </div>
                        <div className="flex-shrink-0 flex" style={{ width: 'calc(50% - var(--box-gap))', height: 'calc(50% - var(--box-gap))' }}>
                            <div className="whybox border-orange flex-1">
                                <EyeIcon className="h-12 w-12 md:h-16 md:w-16 text-orange flex-shrink-0" 
                                    />
                                <div className="flex flex-col items-center justify-center gap-4 px-4">
                                    <Typography className="font-body text-md md:text-lg font-light text-text leading-relaxed">
                                        Looks cool while doing it.
                                    </Typography>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Side */}
                <div className="flex-1 flex flex-col">
                    <Typography type="h4" className="text-lg md:text-2xl font-semibold text-primary mb-4 text-center">
                        The ToothPaste Receiver (The Floating Dongle)
                    </Typography>
                    <div className="flex flex-wrap content-start justify-center flex-1 h-full" style={{ gap: 'var(--box-gap)' }}>
                        <div className="flex-shrink-0 flex" style={{ width: 'calc(50% - var(--box-gap))', height: 'calc(50% - var(--box-gap))' }}>
                            <div className="whybox border-primary flex-1">
                                <ItalicIcon className="h-12 w-12 md:h-16 md:w-16 text-primary flex-shrink-0" 
                                    />
                                <div className="flex flex-col items-center justify-center gap-4 px-4">
                                    <Typography className="font-body text-md md:text-lg font-light text-text text-center leading-relaxed">
                                        Acts as a USB Keyboard (and mouse) without needing any drivers.
                                    </Typography>
                                </div>
                            </div>
                        </div>
                        <div className="flex-shrink-0 flex" style={{ width: 'calc(50% - var(--box-gap))', height: 'calc(50% - var(--box-gap))' }}>
                            <div className="whybox border-primary flex-1">
                                <LockOpenIcon className="h-12 w-12 md:h-16 md:w-16 text-primary flex-shrink-0" 
                                    />
                                <div className="flex flex-col items-center justify-center gap-4 px-4">
                                    <Typography className="font-body text-md md:text-lg font-light text-text text-center leading-relaxed">
                                        Decrypts packets sent from the WebApp and types them out as keystrokes.
                                    </Typography>
                                </div>
                            </div>
                        </div>
                        <div className="flex-shrink-0 flex" style={{ width: 'calc(50% - var(--box-gap))', height: 'calc(50% - var(--box-gap))' }}>
                            <div className="whybox border-primary flex-1">
                                <CpuChipIcon className="h-12 w-12 md:h-16 md:w-16 text-primary flex-shrink-0" 
                                    />
                                <div className="flex flex-col items-center justify-center gap-4 px-4">
                                    <Typography className="font-body text-md md:text-lg font-light text-text leading-relaxed">
                                        Uses an ESP32-S3.
                                    </Typography>
                                </div>
                            </div>
                        </div>
                        <div className="flex-shrink-0 flex" style={{ width: 'calc(50% - var(--box-gap))', height: 'calc(50% - var(--box-gap))' }}>
                            <div className="whybox border-primary flex-1">
                                <LightBulbIcon className="h-12 w-12 md:h-16 md:w-16 text-primary flex-shrink-0" 
                                    />
                                <div className="flex flex-col items-center justify-center gap-4 px-4">
                                    <Typography className="font-body text-md md:text-lg font-light text-text leading-relaxed">
                                        Has RGB!
                                    </Typography>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Centered Scroll Prompt at Bottom - Absolute positioned within section */}
            <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-2 text-white">
                <ArrowDownIcon className="h-5 w-5 animate-bounce" />
                <Typography type="medium">Like what you see?</Typography>
            </div>
        </section>
    );
}
