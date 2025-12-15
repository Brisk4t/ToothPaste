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

const Model = ({ url }) => {
  const groupRef = useRef();
  const gltf = useLoader(GLTFLoader, url);

  useEffect(() => {
    const handleScroll = (event) => {
      if (!groupRef.current) return;
      const deltaY = event.deltaY;
      const rotationSpeed = 0.001;
      groupRef.current.rotation.y += deltaY * rotationSpeed;
    };

    window.addEventListener('wheel', handleScroll);
    return () => window.removeEventListener('wheel', handleScroll);
  }, []);

  return (
    <group ref={groupRef} position={[0, 0, -1]}>
      {/* The group is the 'box' that the camera looks it, since the model isnt always centered on the origin we rotate the group */}
                                      
        <spotLight
            position={[0, 2, 1]} 
            angle={0.3}
            penumbra={0.2} // soft edge
            intensity={11}
            castShadow
        />

        {/* Adjust model parameters to set the tilt inside the 'box' these are not dynamically updated*/}
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
    return (
        <div className="w-full bg-background text-text overflow-x-hidden">
            {/* Hero Section - Image Left (60%) + Text Right (40%) */}
            <section className="min-h-screen flex items-center justify-center px-6 md:px-12 py-5 snap-start">
                <div className="max-w-7xl w-full grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 items-center">
                    {/* Image - 60% of space */}
                    <div className="md:col-span-7 flex justify-center">
                        <div className="relative w-full aspect-square bg-gradient-to-br from-primary to-primary-hover rounded-3xl flex items-center justify-center overflow-hidden">
                            <Canvas style={{ width: '70vw', height: '70vh' }}>
                                <ambientLight intensity={3}/>
                                <directionalLight
                                    position={[0, 2, 5]}  // X, Y, Z in front of the model
                                    intensity={1}       // Adjust brightness
                                    castShadow
                                />
                                
                                <Model url="/ToothPaste_GLB.glb" />
                            </Canvas>
                        </div>
                    </div>

                    {/* Text Blob - 40% of space */}
                    <div className="md:col-span-5 flex flex-col justify-center gap-6">
                        <div>
                            <Typography variant="h2" className="text-text font-bold leading-tight mb-4">
                                Simple. Seamless. Secure.  
                            </Typography>
                            <Typography variant="h3" className="text-lg text-gray-400 leading-relaxed">
                                ToothPaste is a Bluetooth Low Energy (BLE) based device that allows you to securely paste text from your computer to any paired device.
                            </Typography>
                            <br/>
                            <Typography variant="paragraph" className="text-lg text-gray-400 leading-relaxed">
                                No need for special drivers or applications. Just pair ToothPaste with your computer and start pasting text effortlessly right through your browser.
                            </Typography>
                        </div>
                        <Button 
                            size="lg" 
                            className="w-fit bg-primary text-text hover:bg-primary-hover font-semibold normal-case"
                        >
                            Learn More
                        </Button>
                        <div className="flex items-center gap-2 text-gray-400 mt-4">
                            <ArrowDownIcon className="h-5 w-5 animate-bounce" />
                            <Typography variant="small">Scroll to explore</Typography>
                        </div>
                    </div>
                </div>
            </section>

            {/* Feature Slide 1 */}
            <section className="min-h-screen flex items-center justify-center px-6 md:px-12 py-12 snap-start">
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
                                <Typography variant="h4" className="text-lg text-gray-400 leading-relaxed">
                                    I built ToothPaste to solve the problem of securely transferring text like passwords, notes, and other sensitive information
                                    between devices without relying on cloud services or complicated software installations. 
                                </Typography>
                            </div>
                            <Typography variant="h4" className="text-3xl text-gray-400 leading-relaxed">
                                As a student and tinkerer, I often found myself needing to paste information to devices that I didn't want to connect to the internet or install apps on. 
                                ToothPaste provides a simple, secure, and offline solution to this problem.
                            </Typography>
                        </div>
                    </div>
                </div>
            </section>

            {/* Feature Slide 2 */}
            <section className="min-h-screen flex items-center justify-center px-6 md:px-12 py-12 snap-start">
                <div className="max-w-5xl w-full">
                    <div className="flex flex-col gap-8">
                        <div className="flex items-start gap-6">
                            <BoltIcon className="h-12 w-12 text-primary flex-shrink-0 mt-2" />
                            <div>
                                <Typography variant="h3" className="text-text font-bold mb-3">
                                    The nitty gritty details
                                </Typography>
                                <Typography variant="h4" className="text-2xl text-gray-400 leading-relaxed">
                                    While convenient, WEB BLE isn't inherently secure. Its susceptible to snooping and Man In The Middle (MITM) attacks.
                                    Since I wanted to paste passwords over the air, this wouldn't do. 
                                </Typography>
                                <br/>
                                <Typography variant="paragraph" className="text-lg text-gray-400 leading-relaxed">
                                    ToothPaste uses ECDSA cryptography to exchange information over custom packets, the private keys of the sender and receiver are never exposed over the BLE
                                    network and without them, any information transmitted is unusable. 

                                    The first time you set up a ToothPaste, the two devices exchange keys over usb, making it nearly impossible to steal the keys during the initial pairing process as well. 
                                    After that any data sent to a paired ToothPaste device is completly secure.
                                </Typography>
                                <Typography variant="paragraph" className="text-lg text-gray-400 leading-relaxed">
                                    Since ToothPaste shows up as a standard HID keyboard, the receiving system doesnt need any special software or drivers to use it.
                                </Typography>
                                <br/>
                                <Typography variant="paragraph" className="text-xl font-bold text-gray-400 leading-relaxed">
                                    This is the same principle behind the USB Rubber Ducky, and obvious that means ToothPaste can also be used as a pentesting attack vector ;).
                                </Typography>

                            </div>
                        </div>
                    </div>
                </div>
            </section>


            {/* CTA Footer Slide */}
            <section className="min-h-screen flex items-center justify-center px-6 md:px-12 py-12 snap-start">
                <div className="max-w-3xl w-full text-center flex flex-col gap-8">
                    <Typography variant="h2" className="text-text font-bold">
                        Ready to Get Started?
                    </Typography>
                    <Typography variant="paragraph" className="text-lg text-gray-400">
                        Join thousands of users who have already transformed their workflow.
                    </Typography>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Button 
                            size="lg" 
                            className="bg-primary text-text hover:bg-primary-hover font-semibold normal-case"
                        >
                            Get Started
                        </Button>
                        <Button 
                            size="lg" 
                            variant="outlined"
                            className="border-primary text-primary hover:bg-primary hover:text-text font-semibold normal-case"
                        >
                            Contact Us
                        </Button>
                    </div>
                </div>
            </section>
        </div>
    );
}