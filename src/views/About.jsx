import React, { useState, useContext, useRef, useEffect, useCallback } from 'react';
import { Canvas, useLoader, useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Typography, Button } from "@material-tailwind/react";
import { FaGithub } from 'react-icons/fa';
import {
    ArrowDownIcon,
    LockClosedIcon,
    EyeIcon,
    ArrowsRightLeftIcon,
    ArrowRightEndOnRectangleIcon,
    EyeSlashIcon,
    ComputerDesktopIcon,
    QuestionMarkCircleIcon
} from "@heroicons/react/24/outline";

import ToothPaste from "/ToothPaste.svg";

const Model = ({ url, scrollDeltaRef }) => {
    const groupRef = useRef();
    const gltf = useLoader(GLTFLoader, url);
    const targetRotation = useRef(0); // Rotation position at rest (once scrolling stops)  
    const autorotationDirection = useRef(1); // +1 = clockwise, -1 = counterclockwise
    const rotationSpeed = 0.001; // Base rotation speed

    // Register a callback to be called on every frame update
    useFrame(() => {
        if (!groupRef.current) return;

        // Continuously rotate slowly + adjust based on scroll delta
        targetRotation.current += rotationSpeed * autorotationDirection.current; // Slow continuous rotation in direction of last scroll

        // If there was scroll input, adjust target rotation accordingly
        if (scrollDeltaRef.current !== 0) {
            autorotationDirection.current = Math.sign(scrollDeltaRef.current);
            targetRotation.current += scrollDeltaRef.current * 0.001;
            scrollDeltaRef.current = 0;
        }
        // Linear interpolation towards target rotation -> a + (b - a) * t
        groupRef.current.rotation.y = groupRef.current.rotation.y + // a
            (targetRotation.current - groupRef.current.rotation.y) * // b 
            0.05; // t: lower = smoother, higher = snappier
    });

    return (
        <group ref={groupRef} position={[0, -0.1, -1]}>
            {/* The group is the 'box' that the camera looks it, since the model isnt always centered on the origin we rotate the box */}

            <spotLight
                position={[0, 3, 1]}
                angle={0.3}
                penumbra={0.2} // soft edge
                intensity={11}
                castShadow
            />

            {/* Adjust model parameters to set the tilt inside the 'box' these are not dynamically updated, they change only if the model needs to be changed*/}
            <primitive
                object={gltf.scene}
                position={[3, -2.3, 0.6]} // Shift left/right to center around pivot
                rotation={[0.88, 0, 0]}  // Tilt away from camera
                scale={1.2}
            />

        </group>
    );
};

export default function About() {
    const [currentSlide, setCurrentSlide] = useState(0);
    const scrollDeltaRef = useRef(0);
    const containerRef = useRef(null);
    const maxSlides = 4;
    const scrollThreshold = useRef(0);
    const scrollSensitivity = 1000; // Adjust this value to change how many clicks required

    useEffect(() => {
        const handleWheel = (event) => {
            event.preventDefault();

            // Accumulate scroll delta
            scrollThreshold.current += event.deltaY;

            // Check if accumulated scroll exceeds threshold
            if (Math.abs(scrollThreshold.current) >= scrollSensitivity) {
                if (scrollThreshold.current > 0) {
                    setCurrentSlide(prev => Math.min(prev + 1, maxSlides - 1));
                } else {
                    setCurrentSlide(prev => Math.max(prev - 1, 0));
                }
                scrollThreshold.current = 0;
            }

            // Accumulate scroll delta for model rotation - reset after each frame
            scrollDeltaRef.current += event.deltaY;
        };

        window.addEventListener('wheel', handleWheel, { passive: false });
        return () => window.removeEventListener('wheel', handleWheel);
    }, []);

    // Calculate which section should be visible based on current slide
    const getSectionOpacity = (sectionIndex) => {
        return currentSlide === sectionIndex ? 1 : 0;
    };

    return (
        <div ref={containerRef} className=" relative flex-1 w-full bg-background text-text overflow-hidden">

            {/* 3D Model Container - Dynamic positioning and brightness */}
            <div className="absolute inset-0 pointer-events-none">

                <div
                    className={`
                    relative w-full h-full
                    transition-transform duration-1000 ease-in-out
                    ${currentSlide === 0 ? '-translate-x-[15%]' : 'translate-x-0'}
                    `}
                >
                    <Canvas class="w-full h-full">
                        <ambientLight intensity={currentSlide === 0 ? 2 : 1} />
                        <directionalLight
                            position={[0, 2, 5]}
                            intensity={currentSlide === 0 ? 1 : 0.1}
                            castShadow
                        />
                        {/* Positioning Helpers */}
                        {/* <axesHelper args={[5]} />
                        <gridHelper args={[10, 10]} /> */}
                        <Model url="/ToothPaste.glb" scrollDeltaRef={scrollDeltaRef} />
                    </Canvas>
                </div>
            </div>


            {/* Hero Section - Text overlay */}
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
            </section>

            {/* Feature Slide 1 */}
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
                        
                        {/* Center - Model breaks out with negative margins
                        <div className="flex items-center justify-center"></div> */}
                        
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

            {/* Feature Slide 2 */}
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


            {/* CTA Footer Slide */}
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
        </div>
    );
}