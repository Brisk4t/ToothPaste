import React from 'react';
import { Typography } from "@material-tailwind/react";
import { ArrowDownIcon, QuestionMarkCircleIcon, DevicePhoneMobileIcon, 
    ExclamationTriangleIcon, CogIcon, EyeSlashIcon, HeartIcon } from "@heroicons/react/24/outline";
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
                    <div 
                        className="row-span-3 flex flex-col w-full gap-10 bg-background/60 p-5 
                        border-t-2 border-white items-center justify-center text-center"
                        style={{ boxShadow: '0 0 50px rgba(255, 255, 255, 0.3)' }}
                    >
                        <div className="grid grid-cols-3 gap-12 w-full h-2/3 p-4 mt-auto mb-10">
                            {/* Column 1 */}
                            <div className="border-2 rounded-lg border-secondary bg-ink shadow-lg shadow-secondary h-full p-4">
                                <div className="flex flex-col h-full gap-5 m-5">
                                    <CogIcon 
                                        className="h-1/3 w-1/3 text-secondary self-center flex-shrink-0" 
                                        style={{ filter: `drop-shadow(0 0px 3px ${appColors.secondary})` }}
                                    />
                                    <div className="flex-1 flex flex-col items-center justify-start px-6 py-2 overflow-y-auto">
                                        <Typography className="font-body text-2xl font-light text-text leading-relaxed">
                                        As a maker and tinkerer, I often find myself needing to quickly paste passwords, commands, 
                                        or text snippets into devices that aren't connected to the internet.
                                        </Typography>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Column 2 */}
                            <div className="border-2 rounded-lg border-orange bg-ink shadow-lg shadow-orange h-full p-4">
                                <div className="flex flex-col h-full gap-5 m-5">
                                    <EyeSlashIcon className="h-1/3 w-1/3 text-orange self-center flex-shrink-0"
                                    style={{ filter: `drop-shadow(0 0px 3px ${appColors.orange})` }}/>
                                    
                                    <div className="flex-1 flex flex-col items-center justify-start px-6 py-2 gap-4 overflow-y-auto">
                                        <Typography className="font-body text-2xl font-light text-text leading-relaxed">
                                        And sometimes I just don't want to login to my password manager on some a sketchy makerspace computer.
                                        </Typography>
                                        
                                        <div>
                                            <Typography className="font-body text-2xl font-bold text-text">
                                            Or... I'm just lazy
                                            </Typography>
                                            <Typography className="font-body text-md font-extralight text-text italic">
                                            this might be the real reason
                                            </Typography>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Column 3 */}
                            <div className="border-2 rounded-lg border-primary bg-ink shadow-lg shadow-primary h-full p-4">
                                <div className="flex flex-col h-full gap-5 m-5">
                                    <HeartIcon className="h-1/3 w-1/3 text-primary self-center flex-shrink-0" 
                                        style={{ filter: `drop-shadow(0 0px 3px ${appColors.primary})` }}/>
                                    <div className="flex-1 flex flex-col items-center justify-start px-6 py-2 overflow-y-auto gap-10">
                                        <Typography className="font-body text-2xl font-light text-text">
                                        And I just needed a reason to solder some stuff and write some code 
                                        </Typography>
                                        <Typography className="font-body text-2xl font-light text-text">
                                        So i went a bit overboard. 
                                        </Typography>
                                    </div>
                                </div>
                            </div>
                        </div>
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
