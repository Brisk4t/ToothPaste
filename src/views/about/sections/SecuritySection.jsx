import React from 'react';
import { Typography } from "@material-tailwind/react";
import { ArrowDownIcon, LockClosedIcon, ComputerDesktopIcon, ArrowsRightLeftIcon, EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import ToothPaste from "/ToothPaste.svg";

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

            {/* Content Grid with Model Breaking Out - Rows first, columns inside */}
            <div className="flex-1 relative flex items-center justify-center">
                <div className="grid grid-rows-5 gap-20">
                    {/* Row 1-2: Top text */}
                    <div className="row-span-2 grid grid-cols-5 gap-8">
                        <div className="col-span-2 flex flex-col justify-end">
                            <Typography type="h4" className="text-lg text-white font-light leading-relaxed">
                                While convenient, WEB BLE isn't inherently secure. It's susceptible to snooping and <br/><span className="text-secondary">Man In The Middle (MITM)</span> attacks.
                            </Typography>
                        </div>
                        <div className="flex items-center justify-center"></div>
                        <div className="col-span-2 flex flex-col justify-end">
                            <Typography type="h4" className="text-lg font-light text-white leading-relaxed">
                                ToothPaste uses <span className="font-bold">ECDSA Cryptography</span> to exchange information over custom packets. Even if a <span className="italic">certain someone</span> can sniff out the data, it will be unusable.
                            </Typography>
                        </div>
                    </div>

                    {/* Row 3: Icons */}
                    <div className="grid grid-cols-5 gap-8">
                        <div className="col-span-2 flex items-center justify-between px-20">
                            <ComputerDesktopIcon className="h-12 w-12" /> <ArrowsRightLeftIcon className="h-12 w-12 mx-4" /> <EyeIcon className="h-12 w-12 text-secondary" /> 
                            <ArrowsRightLeftIcon className="h-12 w-12 mx-4" /> <img src={ToothPaste} alt="ToothPaste" className="h-12 w-12" />
                        </div>
                        <div className="flex items-center justify-center"></div>
                        <div className="col-span-2 flex items-center justify-between px-20">
                            <ComputerDesktopIcon className="h-12 w-12" /> <ArrowsRightLeftIcon className="h-12 w-12 mx-4" /> <EyeSlashIcon className="h-12 w-12 text-primary" /> 
                            <ArrowsRightLeftIcon className="h-12 w-12 mx-4" /> <img src={ToothPaste} alt="ToothPaste" className="h-12 w-12" />
                        </div>
                    </div>

                    {/* Row 4-5: Bottom text */}
                    <div className="row-span-2 grid grid-cols-5 gap-8">
                        <div className="col-span-2 flex flex-col justify-start">
                            <Typography type="h4" className="text-lg text-white leading-relaxed">
                                Since I wanted to paste passwords over the air, <span className="text-secondary">this wouldn't do.</span> 
                            </Typography>
                        </div>
                        <div className="flex items-center justify-center"></div>
                        <div className="col-span-2 flex flex-col justify-start">
                            <Typography type="h4" className="text-lg font-light text-white leading-relaxed">
                                A ToothPaste shows up as a standard HID keyboard, so the receiving system doesn't need any special software or drivers to use it.
                            </Typography>
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
