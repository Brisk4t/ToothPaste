import React from 'react';
import { Typography } from "@material-tailwind/react";
import { ArrowDownIcon } from "@heroicons/react/24/outline";

export default function HeroSection({ currentSlide, getSectionOpacity }) {
    return (
        // The text itself - model is "injected"
        <section
            className="absolute inset-0 min-h-100 flex items-center justify-center px-6 md:px-12 py-5 z-10"
            style={{
                opacity: getSectionOpacity(0),
                transition: 'opacity 0.3s ease-in-out',
                pointerEvents: getSectionOpacity(0) > 0.5 ? 'auto' : 'none'
            }}
        >
            <div className="max-w-7xl w-full grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 items-center">
                {/* Spacer for model - 60% of space on hero */}
                <div className="md:col-span-6"></div>

                {/* Text Blob - 40% of space */}
                <div className="md:col-span-6 flex flex-col justify-center">
                    <div>
                        <div className="mb-12">
                            <Typography type="h2" className="text-lg text-primary leading-relaxed inline">ToothPaste </Typography>
                            <Typography type="paragraph" className="text-2xl font-light text-white leading-relaxed inline">is a Bluetooth Low Energy (BLE) based device that allows you to securely paste text from your computer to any paired device.</Typography>
                        </div>
                        <br/>
                        <div>
                            <Typography type="h5" className="text-lg font text-white leading-relaxed mb-0">
                                Because sometimes you just want to type                                
                            </Typography>
                            <Typography type="h4" className="text-xl font-light text-gray-500 my-0">
                                ASuperSecurePasswordThatNoOneCanGuess;-)
                            </Typography>
                            <Typography type="h5" className="text-lg text-white leading-relaxed">
                                and you're in a rush.......                                
                            </Typography>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-white mt-20">
                        <ArrowDownIcon className="h-5 w-5 animate-bounce" />
                        <Typography type="medium">Scroll to explore</Typography>
                    </div>
                </div>
            </div>

            {/* TODO: Mobile */}
            <div className="max-w-7xl w-full grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 items-center xl:hidden">
                {/* Spacer for model - 60% of space on hero */}
                <div className="md:col-span-6"></div>

                {/* Text Blob - 40% of space */}
                <div className="md:col-span-6 flex flex-col justify-center">
                    <div>
                        <div className="mb-12">
                            <Typography type="h2" className="text-lg text-primary leading-relaxed inline">ToothPaste </Typography>
                            <Typography type="paragraph" className="text-2xl font-light text-white leading-relaxed inline">is a Bluetooth Low Energy (BLE) based device that allows you to securely paste text from your computer to any paired device.</Typography>
                        </div>
                        <br/>
                        <div>
                            <Typography type="h5" className="text-lg font text-white leading-relaxed mb-0">
                                Because sometimes you just want to type                                
                            </Typography>
                            <Typography type="h4" className="text-xl font-light text-gray-500 my-0">
                                ASuperSecurePasswordThatNoOneCanGuess;-)
                            </Typography>
                            <Typography type="h5" className="text-lg text-white leading-relaxed">
                                and you're in a rush.......                                
                            </Typography>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-white mt-20">
                        <ArrowDownIcon className="h-5 w-5 animate-bounce" />
                        <Typography type="medium">Scroll to explore</Typography>
                    </div>
                </div>
            </div>
        </section>
    );
}
