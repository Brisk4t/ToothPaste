import React from 'react';
import { Typography } from "@material-tailwind/react";
import { ArrowDownIcon, QuestionMarkCircleIcon, DevicePhoneMobileIcon, 
    ExclamationTriangleIcon, CogIcon, EyeSlashIcon, HeartIcon } from "@heroicons/react/24/outline";
import GridBackground from '../../../components/shared/GridBackground';
import { appColors } from '../../../styles/colors';

export default function WhySection({ currentSlide, getSectionOpacity }) {
    return (
        <section
            className="absolute inset-0 flex flex-col py-0 md:py-8 z-2 items-center justify-center overflow-hidden"
            style={{
                opacity: getSectionOpacity(1),
                transition: 'opacity 0.3s ease-in-out',
                pointerEvents: getSectionOpacity(1) > 0.5 ? 'auto' : 'none'
            }}
        >
            {/* Title Row */}
            <div className="absolute top-10 left-0 z-10 px-4 pt-4 max-w-m">
                <div className="flex items-center">
                    {/* Left Third */}
                    <div className="flex flex-col gap-1 text-left">
                        <Typography className="font-body text-md font-light text-dust italic ">
                        "If only i could copy this really long password to this really shady computer, we could achieve world peace. 
                        <br/>Alas! I'm going to type it manually......"
                        </Typography>
                        <Typography className="italic text-xs md:text-sm font-body text-ink">- Someone Definitely</Typography>
                    </div>
                </div>
            </div>

            {/* Content Grid - 1 text row + 1 large container for remaining rows */}
            <div className="flex-1 relative w-full flex flex-col gap-1 md:gap-2 z-25 min-h-0">

                    {/* Row 1 - Text Content */}
                    <div className="flex flex-col justify-center text-center p-4 z-30 flex-shrink">
                        <Typography className="font-header text-sm md:text-2xl text-white">
                        Secure passwords are annoying to type and easy to mess up.
                        </Typography>
                    </div>
                    
                    {/* Container - flex-1 fills remaining space */}
                    <div 
                        className="flex-1 flex flex-col gap-0 w-full bg-background/60 px-3 md:px-8 py-4 md:py-8
                        border-t-2 border-white text-center z-40 min-h-0 overflow-hidden"
                        style={{ boxShadow: '0 0 50px rgba(255, 255, 255, 0.3)' }}
                    >   
                        {/* Top 1/3 - "So I made ToothPaste" */}
                        <div className="hidden xl:block flex items-center justify-center z-40 py-2 flex-shrink">
                            <Typography className="font-header text-3xl md:text-5xl lg:text-6xl font-semibold text-dust leading-tight">
                                <span className='font-light'>So I made</span> ToothPaste.
                            </Typography>
                        </div>

                        {/* 3 Why squares */}
                        <div className="flex-1 flex flex-col w-full gap-8 py-8 px-8 min-h-0 
                        xl:flex-row xl:gap-6 xl:py-12 xl:px-8 ">
                            {/* Square 1 */}
                            <div className="whybox border-secondary shadow-secondary">
                                <CogIcon 
                                    className="h-12 w-12 xl:h-16 xl:w-16 text-secondary flex-shrink-0 mt-1 md:mb-2" 
                                    style={{ filter: `drop-shadow(0 0px 3px ${appColors.secondary})` }}
                                />
                                <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto px-4 min-h-0">
                                    <Typography className="font-body text-xs md:text-sm lg:text-base font-light text-text leading-relaxed">
                                    As a maker and tinkerer, I often find myself needing to quickly paste passwords, commands, 
                                    or text snippets into devices that aren't connected to the internet.
                                    </Typography>
                                </div>
                            </div>
                            
                            {/* Square 2 */}
                            <div className="whybox border-orange shadow-orange">
                                <EyeSlashIcon className="h-12 w-12 md:h-16 md:w-16 text-orange flex-shrink-0 mb-1 md:mb-2"
                                    style={{ filter: `drop-shadow(0 0px 3px ${appColors.orange})` }}/>
                                
                                <div className="flex-1 flex flex-col items-center justify-center gap-2 md:gap-4 overflow-y-auto px-4 min-h-0">
                                    <Typography className="font-body text-xs md:text-sm lg:text-base font-light text-text leading-relaxed">
                                    And sometimes I just don't want to login to my password manager on some a sketchy makerspace computer.
                                    </Typography>
                                    
                                    <div className="text-center flex-shrink-0">
                                        <Typography className="font-body text-sm md:text-base font-bold text-text">
                                        Or... I'm just lazy
                                        </Typography>
                                        <Typography className="font-body text-xs font-extralight text-text italic">
                                        this might be the real reason
                                        </Typography>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Square 3 */}
                            <div className="whybox border-primary shadow-primary">
                                <HeartIcon className="h-12 w-12 xl:h-16 xl:w-16 text-primary flex-shrink-0 mb-1 md:mb-2" 
                                    style={{ filter: `drop-shadow(0 0px 3px ${appColors.primary})` }}/>
                                <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto gap-2 md:gap-4 
                                    px-4 min-h-0">
                                    <Typography className="font-body text-xs md:text-sm lg:text-base font-light text-text">
                                    And I just needed a reason to solder some stuff and write some code 
                                    </Typography>
                                    <Typography className="font-body text-xs md:text-sm lg:text-base font-light text-text">
                                    And then I went a bit overboard. 
                                    </Typography>
                                </div>
                            </div>
                        </div>
                    
                                {/* Centered Scroll Prompt at Bottom */}
            <div className="flex items-center justify-center gap-1 md:gap-2 text-white flex-shrink-0 mt-1 md:mt-2 text-xs md:text-sm">
                <ArrowDownIcon className="h-3 w-3 md:h-4 md:w-4 animate-bounce" />
                <Typography type="small">What makes it secure?</Typography>
            </div>
                    </div>
                    
                </div>


        </section>
    );
}
