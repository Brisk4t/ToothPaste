import React from 'react';
import { Typography } from "@material-tailwind/react";
import { ArrowDownIcon, LockClosedIcon, EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { appColors } from '../../../styles/colors';

export default function SecuritySection({ currentSlide, getSectionOpacity }) {
    return (
        <section
            className="absolute inset-0 flex flex-col px-6 md:px-12 py-12 z-10 pb-32"
            style={{
                opacity: getSectionOpacity(2),
                transition: 'opacity 0.3s ease-in-out',
                pointerEvents: getSectionOpacity(2) > 0.5 ? 'auto' : 'none'
            }}
        >
            {/* Title Row */}
            <div className="flex items-start justify-center gap-4 mb-12 flex-shrink-0">
                <LockClosedIcon className="h-12 w-12 text-primary flex-shrink-0" />
                <Typography type="h2" className="text-text font-bold">
                    The nitty gritty details
                </Typography>
            </div>

            {/* 50/50 Split Container */}
            <div className="flex-1 relative flex items-stretch justify-center gap-8 min-h-0">
                {/* Left Side */}
                <div className="flex-1 flex flex-col">
                    <Typography type="h4" className="text-lg md:text-2xl font-semibold text-secondary mb-4 text-center">
                        The Problem
                    </Typography>
                    <div className="flex flex-wrap gap-3 content-start flex-1 min-h-0">
                        <div className="flex-shrink-0" style={{ width: 'calc(50% - 6px)' }}>
                            <div className="whybox border-secondary shadow-secondary">
                                <EyeIcon className="h-12 w-12 md:h-16 md:w-16 text-secondary flex-shrink-0" 
                                    style={{ filter: `drop-shadow(0 0px 3px ${appColors.secondary})` }}/>
                                <div className="flex flex-col items-center justify-center gap-4 px-4">
                                    <Typography className="font-body text-md md:text-lg font-light text-text leading-relaxed">
                                        Not Inherently Secure
                                    </Typography>
                                </div>
                            </div>
                        </div>
                        <div className="flex-shrink-0" style={{ width: 'calc(50% - 6px)' }}>
                            <div className="whybox border-secondary shadow-secondary">
                                <EyeIcon className="h-12 w-12 md:h-16 md:w-16 text-secondary flex-shrink-0" 
                                    style={{ filter: `drop-shadow(0 0px 3px ${appColors.secondary})` }}/>
                                <div className="flex flex-col items-center justify-center gap-4 px-4">
                                    <Typography className="font-body text-md md:text-lg font-light text-text leading-relaxed">
                                        Snooping Attacks
                                    </Typography>
                                </div>
                            </div>
                        </div>
                        <div className="flex-shrink-0" style={{ width: 'calc(50% - 6px)' }}>
                            <div className="whybox border-secondary shadow-secondary">
                                <EyeIcon className="h-12 w-12 md:h-16 md:w-16 text-secondary flex-shrink-0" 
                                    style={{ filter: `drop-shadow(0 0px 3px ${appColors.secondary})` }}/>
                                <div className="flex flex-col items-center justify-center gap-4 px-4">
                                    <Typography className="font-body text-md md:text-lg font-light text-text leading-relaxed">
                                        MITM Attacks
                                    </Typography>
                                </div>
                            </div>
                        </div>
                        <div className="flex-shrink-0" style={{ width: 'calc(50% - 6px)' }}>
                            <div className="whybox border-secondary shadow-secondary">
                                <EyeIcon className="h-12 w-12 md:h-16 md:w-16 text-secondary flex-shrink-0" 
                                    style={{ filter: `drop-shadow(0 0px 3px ${appColors.secondary})` }}/>
                                <div className="flex flex-col items-center justify-center gap-4 px-4">
                                    <Typography className="font-body text-md md:text-lg font-light text-text leading-relaxed">
                                        Password Theft Risk
                                    </Typography>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Side */}
                <div className="flex-1 flex flex-col">
                    <Typography type="h4" className="text-lg md:text-2xl font-semibold text-primary mb-4 text-center">
                        The Solution
                    </Typography>
                    <div className="flex flex-wrap gap-3 content-start flex-1 min-h-0">
                        <div className="flex-shrink-0" style={{ width: 'calc(50% - 6px)' }}>
                            <div className="whybox border-primary shadow-primary">
                                <EyeSlashIcon className="h-12 w-12 md:h-16 md:w-16 text-primary flex-shrink-0" 
                                    style={{ filter: `drop-shadow(0 0px 3px ${appColors.primary})` }}/>
                                <div className="flex flex-col items-center justify-center gap-4 px-4">
                                    <Typography className="font-body text-md md:text-lg font-light text-text leading-relaxed">
                                        ECDSA Cryptography
                                    </Typography>
                                </div>
                            </div>
                        </div>
                        <div className="flex-shrink-0" style={{ width: 'calc(50% - 6px)' }}>
                            <div className="whybox border-primary shadow-primary">
                                <EyeSlashIcon className="h-12 w-12 md:h-16 md:w-16 text-primary flex-shrink-0" 
                                    style={{ filter: `drop-shadow(0 0px 3px ${appColors.primary})` }}/>
                                <div className="flex flex-col items-center justify-center gap-4 px-4">
                                    <Typography className="font-body text-md md:text-lg font-light text-text leading-relaxed">
                                        Custom Packets
                                    </Typography>
                                </div>
                            </div>
                        </div>
                        <div className="flex-shrink-0" style={{ width: 'calc(50% - 6px)' }}>
                            <div className="whybox border-primary shadow-primary">
                                <EyeSlashIcon className="h-12 w-12 md:h-16 md:w-16 text-primary flex-shrink-0" 
                                    style={{ filter: `drop-shadow(0 0px 3px ${appColors.primary})` }}/>
                                <div className="flex flex-col items-center justify-center gap-4 px-4">
                                    <Typography className="font-body text-md md:text-lg font-light text-text leading-relaxed">
                                        Unsniffable Data
                                    </Typography>
                                </div>
                            </div>
                        </div>
                        <div className="flex-shrink-0" style={{ width: 'calc(50% - 6px)' }}>
                            <div className="whybox border-primary shadow-primary">
                                <EyeSlashIcon className="h-12 w-12 md:h-16 md:w-16 text-primary flex-shrink-0" 
                                    style={{ filter: `drop-shadow(0 0px 3px ${appColors.primary})` }}/>
                                <div className="flex flex-col items-center justify-center gap-4 px-4">
                                    <Typography className="font-body text-md md:text-lg font-light text-text leading-relaxed">
                                        HID Keyboard
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
