import React, { useState, useContext, useRef, useEffect, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Typography, Button } from "@material-tailwind/react";
import { 
    ArrowDownIcon, 
    SparklesIcon, 
    LockClosedIcon, 
    BoltIcon, 
    CheckCircleIcon,
    GlobeAltIcon
} from "@heroicons/react/24/outline";
import ToothPaste_Device_V1_Front from '../assets/ToothPaste_Device_V1_Front.png';

const Model = ({ url, scrollProgress }) => {
  const groupRef = useRef();
  const gltf = useLoader(GLTFLoader, url);

  useEffect(() => {
    if (!groupRef.current) return;
    // Update rotation based on scroll progress
    groupRef.current.rotation.y = scrollProgress * 0.001;
  }, [scrollProgress]);

  return (
    <group ref={groupRef} position={[0, 0, -1]}>
      {/* The group is the 'box' that the camera looks it, since the model isnt always centered on the origin we rotate the box */}
                                      
        <spotLight
            position={[0, 2, 1]} 
            angle={0.3}
            penumbra={0.2} // soft edge
            intensity={11}
            castShadow
        />

        {/* Adjust model parameters to set the tilt inside the 'box' these are not dynamically updated, they change only if the model needs to be changed*/}
        <primitive
        object={gltf.scene}
        position={[2.5, -2, 0.6]} // Shift left/right to center around pivot
        rotation={[0.88, 0, 0]}  // Tilt away from camera
        scale={1}
        />

    </group>
  );
};

export default function About() {
    const [currentSlide, setCurrentSlide] = useState(0);
    const [scrollProgress, setScrollProgress] = useState(0);
    const containerRef = useRef(null);
    const maxSlides = 4;
    const scrollThreshold = useRef(0);
    const scrollSensitivity = 700; // Adjust this value to change how many clicks required

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
        
        // Still update scrollProgress for the 3D model rotation
        setScrollProgress(prev => {
          const newProgress = prev + event.deltaY;
          return Math.max(0, newProgress);
        });
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
                            intensity={currentSlide === 0 ? 1 : 0.4}
                            castShadow
                        />
                        <Model url="/ToothPaste.glb" scrollProgress={scrollProgress} />
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
                    <div className="md:col-span-7"></div>

                    {/* Text Blob - 40% of space */}
                    <div className="md:col-span-5 flex flex-col justify-center gap-6">
                        <div>
                            <Typography variant="h2" className="text-text font-bold leading-tight mb-4">
                                Simple. Seamless. Secure.  
                            </Typography>
                            <Typography variant="h3" className="text-lg text-white leading-relaxed">
                                ToothPaste is a Bluetooth Low Energy (BLE) based device that allows you to securely paste text from your computer to any paired device.
                            </Typography>
                            <br/>
                            <Typography variant="paragraph" className="text-lg text-white leading-relaxed">
                                No need for special drivers or applications. Just pair ToothPaste with your computer and start pasting text effortlessly right through your browser.
                            </Typography>
                        </div>
                        <Button 
                            size="lg" 
                            // className="w-fit bg-primary text-text hover:bg-primary-hover font-semibold normal-case"
                        >
                            Learn More
                        </Button>
                        <div className="flex items-center gap-2 text-white mt-4">
                            <ArrowDownIcon className="h-5 w-5 animate-bounce" />
                            <Typography variant="small">Scroll to explore</Typography>
                        </div>
                    </div>
                </div>
            </section>

            {/* Feature Slide 1 */}
            <section 
                className="absolute inset-0 min-h-screen flex items-center justify-center px-6 md:px-12 py-12 z-10"
                style={{
                  opacity: getSectionOpacity(1),
                  transition: 'opacity 0.3s ease-in-out',
                  pointerEvents: getSectionOpacity(1) > 0.5 ? 'auto' : 'none'
                }}
            >
                <div className="max-w-6xl w-full">
                    <div className="flex flex-col gap-8">
                        <div className="flex items-center gap-4">
                            <LockClosedIcon className="h-12 w-12 text-primary flex-shrink-0" />
                            <Typography variant="h2" className="text-text font-bold">
                                Why?
                            </Typography>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="flex items-start gap-4">
                                <Typography variant="h4" className="text-lg text-white leading-relaxed">
                                    I built ToothPaste to solve the problem of securely transferring text like passwords, notes, and other sensitive information
                                    between devices without relying on cloud services or complicated software installations. 
                                </Typography>
                            </div>
                            <Typography variant="h4" className="text-3xl text-white leading-relaxed">
                                As a student and tinkerer, I often found myself needing to paste information to devices that I didn't want to connect to the internet or install apps on. 
                                ToothPaste provides a simple, secure, and offline solution to this problem.
                            </Typography>
                        </div>
                    </div>
                </div>
            </section>

            {/* Feature Slide 2 */}
            <section 
                className="absolute inset-0 min-h-screen flex items-center justify-center px-6 md:px-12 py-12 z-10"
                style={{
                  opacity: getSectionOpacity(2),
                  transition: 'opacity 0.3s ease-in-out',
                  pointerEvents: getSectionOpacity(2) > 0.5 ? 'auto' : 'none'
                }}
            >
                <div className="max-w-5xl w-full">
                    <div className="flex flex-col gap-8">
                        <div className="flex items-start gap-6">
                            <BoltIcon className="h-12 w-12 text-primary flex-shrink-0 mt-2" />
                            <div>
                                <Typography variant="h3" className="text-text font-bold mb-3">
                                    The nitty gritty details
                                </Typography>
                                <Typography variant="h4" className="text-2xl text-white leading-relaxed">
                                    While convenient, WEB BLE isn't inherently secure. Its susceptible to snooping and Man In The Middle (MITM) attacks.
                                    Since I wanted to paste passwords over the air, this wouldn't do. 
                                </Typography>
                                <br/>
                                <Typography variant="paragraph" className="text-lg text-white leading-relaxed">
                                    ToothPaste uses ECDSA cryptography to exchange information over custom packets, the private keys of the sender and receiver are never exposed over the BLE
                                    network and without them, any information transmitted is unusable. 

                                    The first time you set up a ToothPaste, the two devices exchange keys over usb, making it nearly impossible to steal the keys during the initial pairing process as well. 
                                    After that any data sent to a paired ToothPaste device is completly secure.
                                </Typography>
                                <Typography variant="paragraph" className="text-lg text-white leading-relaxed">
                                    Since ToothPaste shows up as a standard HID keyboard, the receiving system doesnt need any special software or drivers to use it.
                                </Typography>
                                <br/>
                                <Typography variant="paragraph" className="text-xl font-bold text-white leading-relaxed">
                                    This is the same principle behind the USB Rubber Ducky, and obvious that means ToothPaste can also be used as a pentesting attack vector ;).
                                </Typography>

                            </div>
                        </div>
                    </div>
                </div>
            </section>


            {/* CTA Footer Slide */}
            <section 
                className="absolute inset-0 min-h-screen flex items-center justify-center px-6 md:px-12 py-12 z-10"
                style={{
                  opacity: getSectionOpacity(3),
                  transition: 'opacity 0.3s ease-in-out',
                  pointerEvents: getSectionOpacity(3) > 0.5 ? 'auto' : 'none'
                }}
            >
                <div className="max-w-3xl w-full text-center flex flex-col gap-8">
                    <Typography variant="h2" className="text-text font-bold">
                        Ready to Get Started?
                    </Typography>
                    <Typography variant="paragraph" className="text-lg text-white">
                        Join thousands of users who have already transformed their workflow.
                    </Typography>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Button 
                            className='w-full h-10 my-4 bg-primary text-text hover:bg-primary-hover focus:bg-primary-focus active:bg-primary-active flex items-center justify-center size-sm disabled:bg-hover'

                            // className="bg-primary text-text hover:bg-primary-hover font-semibold normal-case"
                        >
                            Get Started
                        </Button>
                        <Button 
                            className='w-full h-10 my-4 bg-primary text-text hover:bg-primary-hover focus:bg-primary-focus active:bg-primary-active flex items-center justify-center size-sm disabled:bg-hover'

                            // className="border-secondary text-text hover:bg-primary hover:text-text font-semibold normal-case"
                        >
                            Contact Us
                        </Button>
                    </div>
                </div>
            </section>
        </div>
    );
}