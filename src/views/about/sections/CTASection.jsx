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
            {/* Title */}
            <Typography className="font-header text-4xl md:text-5xl xl:text-7xl font-normal text-white mb-8 md:mb-12 text-center">
                Want to learn more?
            </Typography>

            {/* Body */}
            <Typography className="font-body text-xl md:text-2xl xl:text-3xl font-light text-white text-center max-w-6xl mb-8 md:mb-10">
                ToothPaste is currently closed source while I finalize the hardware and software design.
                However, if you're interested in collaborating, contributing, or just want to chat about the project feel free to reach out!
            </Typography>

            {/* Button */}
            <Button
                size="lg"
                className='h-10 bg-primary text-text items-center justify-center px-6' 
                onClick={() => window.open('https://github.com/Brisk4t', '_blank')}>
                <FaGithub className="mr-2 h-5 w-5" />
                My GitHub
            </Button>
        </section>
    );
}
