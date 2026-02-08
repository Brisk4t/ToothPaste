import React from 'react';
import { Typography } from "@material-tailwind/react";
import { ArrowDownIcon, QuestionMarkCircleIcon } from "@heroicons/react/24/outline";

export default function WhySection({ currentSlide, getSectionOpacity }) {
    return (
        <section
            className="absolute inset-0 flex flex-col px-6 md:px-12 py-12 z-10 pb-32"
            style={{
                opacity: getSectionOpacity(1),
                transition: 'opacity 0.3s ease-in-out',
                pointerEvents: getSectionOpacity(1) > 0.5 ? 'auto' : 'none'
            }}
        >
            {/* Title Row */}
            <div className="flex items-center justify-center gap-4 mb-12 flex-shrink-0">
                <QuestionMarkCircleIcon className="h-12 w-12 text-primary flex-shrink-0" />
                <Typography type="h2" className="text-text font-bold">
                    Why?
                </Typography>
            </div>

            {/* Content Grid with Model Breaking Out */}
            <div className="flex-1 relative">
                <div className="grid grid-cols-2 gap-8 h-full items-center">
                    {/* Left Third */}
                    <div className="flex flex-col col-span-1 gap-6">
                        <Typography type="h4" className="text-2xl font-light text-white leading-relaxed">
                            As a student and tinkerer, I often found myself needing to paste information to devices that I didn't want to connect to the internet or install apps on.
                        </Typography>
                        
                        <div className="flex flex-col gap-4">
                            <Typography type="h4" className="text-2xl font-extralight text-orange leading-relaxed">
                                MakerSpaces.
                            </Typography>
                            <Typography type="h4" className="text-2xl font-extralight text-orange leading-relaxed">
                                Libraries.
                            </Typography>
                            <Typography type="h4" className="text-2xl font-extralight text-orange leading-relaxed">
                                Vulnerable systems I'm definitely not trying to hack.
                            </Typography>
                        </div>
                    </div>
                    
                    {/* Right Third */}
                    <div className="flex flex-col col-span-1 gap-10">
                        <Typography type="h4" className="text-lg font-light text-white leading-relaxed">
                        Usually this involves emailing myself, using cloud clipboard services, or texting myself.
                        </Typography>
                        <Typography type="h4" className="text-lg text-white leading-relaxed">
                        ToothPaste makes this process seamless and secure by allowing me to quickly paste text directly to any nearby paired device.
                        </Typography>
                    </div>
                </div>
            </div>

            {/* Centered Scroll Prompt at Bottom - Absolute positioned within section */}
            <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-2 text-white">
                <ArrowDownIcon className="h-5 w-5 animate-bounce" />
                <Typography type="medium">What makes it secure?</Typography>
            </div>
        </section>
    );
}
