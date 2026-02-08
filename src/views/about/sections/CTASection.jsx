import React from 'react';
import { Typography, Button } from "@material-tailwind/react";
import { FaGithub } from 'react-icons/fa';

export default function CTASection({ currentSlide, getSectionOpacity }) {
    return (
        <section
            className="absolute inset-0 flex flex-col items-center justify-center px-6 md:px-12 z-10"
            style={{
                opacity: getSectionOpacity(3),
                transition: 'opacity 0.3s ease-in-out',
                pointerEvents: getSectionOpacity(3) > 0.5 ? 'auto' : 'none'
            }}
        >
            {/* Title Row */}
            <div className="mb-12 flex justify-center">
                <Typography type="h2" className="text-text font-bold">
                    Want to learn more?
                </Typography>
            </div>

            {/* Content Grid with Model Breaking Out */}
            <div className="relative">
                <div className="grid grid-cols-5 gap-8 items-center">
                    {/* Left Third */}
                    <div></div>
                    
                    {/* Center - Model breaks out with negative margins + CTA text */}
                    <div className="flex flex-col col-span-3 gap-8 text-center items-center justify-center">
                        <Typography type="h5" className="text-lg text-white">
                            ToothPaste is currently closed source while I finalize the hardware and software design.
                            However, if you're interested in collaborating, contributing, or just want to chat about the project feel free to reach out!
                        </Typography>
                        
                        <Button
                            size="lg"
                            className='h-10 bg-primary text-text items-center justify-center px-6' 
                            onClick={() => window.open('https://github.com/Brisk4t', '_blank')}>
                            <FaGithub className="mr-2 h-5 w-5" />
                            My GitHub
                        </Button>
                    </div>
                    
                    {/* Right Third */}
                    <div></div>
                </div>
            </div>
        </section>
    );
}
