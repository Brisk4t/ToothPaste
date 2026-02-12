import React from 'react';
import { Typography } from "@material-tailwind/react";
import { ArrowDownIcon, QuestionMarkCircleIcon, DevicePhoneMobileIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import GridBackground from '../../../components/shared/GridBackground';
import { appColors } from '../../../styles/colors';

export default function WhySection({ currentSlide, getSectionOpacity }) {
    return (
        <section
            className="absolute inset-0 flex flex-col px-0 md:px-0 py-0 z-2 items-center justify-center"
            style={{
                opacity: getSectionOpacity(1),
                transition: 'opacity 0.3s ease-in-out',
                pointerEvents: getSectionOpacity(1) > 0.5 ? 'auto' : 'none'
            }}
        >
            {/* Title Row */}
            <div className="absolute top-5 gap-10 mb-8 flex-shrink-0">
                <div className="grid grid-cols-3 gap-40 h-full items-center">
                    {/* Left Third */}
                    <div className="flex flex-col col-span-1 gap-2 text-left">
                        <Typography type="h5" className="font-body text-lg font-light text-graphite italic ">
                        "If only i could copy this really long password to this really shady computer, we could achieve world peace. 
                        <br/>Alas! I'm going to type it manually......"
                        </Typography>
                        <Typography className="italic text-lg font-body text-graphite">- Someone Definitely</Typography>
                    </div>
                    
                </div>
            </div>

            {/* Content Grid - 1 text row + 1 large container for remaining rows */}
            <div className="flex-1 relative w-full">
                <div className="grid grid-cols-1 grid-rows-4 gap-8 h-full">

                    {/* Row 1 - Text Content */}
                    <div className="row-span-1 flex flex-col justify-center text-center px-8">
                        <Typography type="h1" className="font-header text-3xl font-light text-white">
                        Secure passwords are annoying to type and easy to mess up.
                        </Typography>
                    </div>
                    
                    {/* Container - Rows 2-4 spanning full width */}
                    <div className="row-span-3 flex flex-col w-full gap-10 bg-ink/60 rounded-sm border-t-4  
                    border-white items-center justify-center text-center">
                        <Typography className="font-body text-2xl font-light text-text italic">
                        Placeholder content
                        </Typography>
                        <DevicePhoneMobileIcon className="h-16 w-16 text-white" />
                    </div>
                </div>
            </div>


            {/* Title Row */}
            <div className="flex items-end justify-end gap-10 flex-shrink-0 px-10">
                <div className="grid grid-cols-2 gap-40 h-full items-end">
                    {/* Left Third */}
                    <div></div>
                   {/* Right Third */}
                    <div className="flex flex-col col-span-1 gap-40 text-right">
                        {/* <Typography type="h3" className="font-header text-lg font-light text-gray-500 italic ">
                        Sometimes installing clipboard apps is not an option.
                        </Typography> */}
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
