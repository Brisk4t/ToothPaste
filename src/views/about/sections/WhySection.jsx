import React from 'react';
import { Typography } from "@material-tailwind/react";
import { ArrowDownIcon, QuestionMarkCircleIcon } from "@heroicons/react/24/outline";

export default function WhySection({ currentSlide, getSectionOpacity }) {
    return (
        <section
            className="absolute inset-0 flex flex-col px-6 md:px-12 py-48 z-10 pb-10 items-center justify-center"
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
                        <Typography type="h5" className="font-body text-lg font-light text-gray-700 italic ">
                        "If only i could copy this really long password to this really shady computer, we could achieve world peace. 
                        <br/>Alas! I'm going to type it manually......"
                        </Typography>
                        <Typography className="italic text-lg font-body text-gray-700">- Someone Definitely</Typography>
                    </div>
                    
                </div>
            </div>

            {/* Content Grid with Model Breaking Out */}
            <div className="flex-1 relative">
                <div className="grid grid-cols-5 grid-rows-5 gap-8 h-full">
                    {/* Row 1 - Height 2 */}
                    <div className="col-span-2 row-span-2 flex flex-col gap-40 text-left">
                        <Typography type="h1" className="font-header text-3xl font-light text-white">
                        Secure passwords are annoying to type and easy to mess up.
                        </Typography>

                    </div>
                    <div className="row-span-2"></div>
                    <div className="col-span-2 row-span-2 flex flex-col gap-40 text-left">
                        <Typography className="font-body text-3xl font-light text-white">
                        ToothPaste acts a keyboard that types for you. <br/>
                        Just copy on one device, and paste on another - no cloud, no middleman, no hassle.
                        And it does it all securely.
                        </Typography>
                    </div>
                    
                    {/* Row 2 - Height 1 */}
                    <div className="col-span-2 row-span-1 flex flex-col gap-40 text-left">
                        {/* <Typography className="font-body text-3xl font-light text-white">
                        [Left Content Row 2]
                        </Typography> */}
                    </div>
                    <div className="row-span-1"></div>
                    <div className="col-span-2 row-span-1 flex flex-col gap-40 text-left">
                        <Typography className="font-body text-xl font-light text-white italic">
                        Of course, thats's not all it can do.
                        </Typography>
                    </div>
                    
                    {/* Row 3 - Height 2 */}
                    <div className="col-span-2 row-span-2 flex flex-col gap-40 text-left">
                        <Typography type="h3" className="font-header text-lg font-light text-text italic ">
                        And installing clipboard sharing apps isn't always an option.
                        </Typography>
                    </div>
                    <div className="row-span-2"></div>
                    <div className="col-span-2 row-span-2 flex flex-col gap-40 text-left">
                        <Typography className="font-body text-3xl font-light text-white">
                        It can also act as a mouse, a media controller, or even something 
                        more..... nefarious.
                        </Typography>
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
