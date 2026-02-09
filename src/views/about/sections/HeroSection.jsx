import React from 'react';
import { Typography } from "@material-tailwind/react";
import { ArrowDownIcon } from "@heroicons/react/24/outline";
import TypingAnimation from '../../../components/TypingAnimation';

export default function HeroSection({ currentSlide, getSectionOpacity }) {
    return (
        // The text itself - model is "injected"
        <section
            className="absolute inset-0 min-h-100 flex items-center justify-center 
            px-6 
            xl:px-12 
            py-5 
            z-10 "
            style={{
                opacity: getSectionOpacity(0),
                transition: 'opacity 0.3s ease-in-out',
                pointerEvents: getSectionOpacity(0) > 0.5 ? 'auto' : 'none'
            }}
        >
            <div className="hidden xl:grid w-full grid-cols-1 xl:grid-cols-12 gap-8 xl:gap-12 items-center m-10">
                {/* Spacer for model - 1/3 of space on hero */}
                <div className="xl:col-span-5"></div>

                {/* Text Blob - 2/3 of space */}
                <div className="xl:col-span-7 flex flex-col justify-center">
                    <div>
                        <div className="mb-40">
                            <Typography className="font-header text-8xl font-bold text-primary ">ToothPaste</Typography>
                            <Typography style={{ fontFamily: '"Libre Barcode 39 Extended", system-ui' }} className="text-2xl leading-relaxed">ToothPaste</Typography>
                            <Typography className="font-body text-4xl font-light italic text-gray-500 leading-relaxed ">Plug In. Pair. Paste.</Typography>
                        </div>
                        <div className="flex flex-col gap-4 ">
                            <Typography type="h5" className="font-body text-white leading-relaxed mb-0">
                                Because sometimes you just want to type                                
                            </Typography>
                            <TypingAnimation
                                texts={[
                                    'MySecurePassword123!@#',
                                    'Long Street, Longer Avenue, Ugh City, State, Country - 123 123',
                                    'Or just casual government secrets.....'
                                ]}
                                typingSpeed={10}
                                pauseTime={1000}
                                repeat={true}
                                className="font-body font-light text-3xl text-gray-500 block my-0"
                            />
                            <Typography type="h5" className="font-body text-white leading-relaxed">
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

            {/* Mobile */}
            <div className="w-full xl:hidden">
                {/* Text Blob - 2/3 of space */}
                <div className="flex flex-col">
                    <div>
                        <div className="mb-40">
                            <Typography className="font-header text-8xl font-bold text-primary ">ToothPaste</Typography>
                            <Typography style={{ fontFamily: '"Libre Barcode 39 Extended", system-ui' }} className="text-2xl leading-relaxed">ToothPaste</Typography>
                            <Typography className="font-body text-4xl font-light italic text-gray-500 leading-relaxed ">Plug In. Pair. Paste</Typography>
                        </div>
                        <div className="flex flex-col gap-4 ">
                            <Typography type="h5" className="font-body text-white leading-relaxed mb-0">
                                Because sometimes you just want to type                                
                            </Typography>
                            <TypingAnimation
                                texts={[
                                    'MySecurePassword123!@#',
                                    'Long Street, Longer Avenue, Ugh City, State, Country - 123 123',
                                    'Or just casual government secrets.....'
                                ]}
                                typingSpeed={10}
                                pauseTime={1000}
                                repeat={true}
                                className="font-body font-light text-3xl text-gray-500 block my-0"
                            />
                            <Typography type="h5" className="font-body text-white leading-relaxed">
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
