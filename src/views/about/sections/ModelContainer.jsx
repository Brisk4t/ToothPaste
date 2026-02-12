import React, { useRef } from 'react';
import { Canvas, useLoader, useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AxesHelper } from 'three';

// Per-slide configuration: lighting intensity, translation, and autorotation
const SLIDE_CONFIG = {
    mobile: [
        { ambient: 0.2, directional: 0.5, translateX: 0, translateY: 0, translateZ: 0, autorotate: true },      // Slide 0 - Hero
        { ambient: 0.3, directional: 0.15, translateX: 0, translateY: 0, translateZ: 0, autorotate: true },     // Slide 1 - Why
        { ambient: 0.3, directional: 0.15, translateX: 0, translateY: 0, translateZ: 0, autorotate: true },     // Slide 2 - Security
        { ambient: 0.5, directional: 0.1, translateX: 0, translateY: 0, translateZ: 6, autorotate: false }       // Slide 3 - CTA
    ],
    desktop: [
        { ambient: 2, directional: 1, translateX: -6.5, translateY: 0, translateZ: -1, autorotate: true },          // Slide 0 - Hero
        { ambient: 2, directional: 1, translateX: 0, translateY: 0, translateZ: -3, autorotate: true },       // Slide 1 - Why
        { ambient: 1, directional: 0.1, translateX: 5, translateY: -5, translateZ: 0, autorotate: true },       // Slide 2 - Security
        { ambient: 0.5, directional: 0.1, translateX: 0.02, translateY: 0, translateZ: 6, autorotate: false }        // Slide 3 - CTA
    ]
};

const Model = ({ url, scrollDeltaRef, translateX, translateY, translateZ, autorotate = true }) => {
    const groupRef = useRef();
    const axesHelperRef = useRef(null);
    const gltf = useLoader(GLTFLoader, url);
    const targetRotation = useRef(0);
    const autorotationDirection = useRef(1);
    const rotationSpeed = 0.005;
    
    // Position interpolation
    const currentPos = useRef([0, 0, 0]);
    const targetX = useRef(translateX);
    const targetY = useRef(translateY);
    const targetZ = useRef(translateZ || 0);
    const interpolationSpeed = 0.08;

    // Update target position when props change
    useFrame(() => {
        targetX.current = translateX;
        targetY.current = translateY;
        targetZ.current = translateZ || 0;
    });

    useFrame(() => {
        if (!groupRef.current) return;

        // Interpolate position
        currentPos.current[0] += (targetX.current - currentPos.current[0]) * interpolationSpeed;
        currentPos.current[1] += (targetY.current - currentPos.current[1]) * interpolationSpeed;
        currentPos.current[2] += (targetZ.current - currentPos.current[2]) * interpolationSpeed;
        
        groupRef.current.position.x = currentPos.current[0];
        groupRef.current.position.y = currentPos.current[1] - 0.1;
        groupRef.current.position.z = currentPos.current[2] - 2;

        // Only apply autorotation if enabled for this slide
        if (autorotate) {
            targetRotation.current += rotationSpeed * autorotationDirection.current;
        }

        if (scrollDeltaRef.current !== 0) {
            autorotationDirection.current = Math.sign(scrollDeltaRef.current);
            targetRotation.current += scrollDeltaRef.current * 0.001;
            scrollDeltaRef.current = 0;
        }

        groupRef.current.rotation.y = groupRef.current.rotation.y +
            (targetRotation.current - groupRef.current.rotation.y) *
            0.05;
    });

    return (
        // This group is the "box" that contains the model and allows us to manipulate its position and rotation
        <group ref={groupRef} position={[0, -0.1, -2]}>
            <spotLight
                position={[0, 3, 1]}
                angle={0.3}
                penumbra={0.2}
                intensity={11}
                castShadow
            />

            {/* Axes Helper - visualizes the center point and axes */}
            <primitive
                ref={axesHelperRef}
                object={new AxesHelper(5)}
                position={[0, 0, 0]}
            />

            {/* // This primitive is the actual 3D model loaded from the GLB file
            // We dont manipulate its position or rotation directly since it isnt centered on the origin */}
            <primitive
                object={gltf.scene}
                position={[3, -2.3, 0.6]}
                rotation={[0.88, 0, 0]}
                scale={1.2}
            />
        </group>
    );
};

export default function ModelContainer({ currentSlide, scrollDeltaRef, isMobile }) {
    const config = isMobile ? SLIDE_CONFIG.mobile : SLIDE_CONFIG.desktop;
    const slideConfig = config[currentSlide] || config[0];

    return (
        <div className="absolute inset-0 pointer-events-none">
            <div className="relative w-full h-full">
                <Canvas className="w-full h-full">
                    <ambientLight intensity={slideConfig.ambient} />
                    <directionalLight
                        position={[0, 2, 5]}
                        intensity={slideConfig.directional}
                        castShadow
                    />
                    <Model 
                        url="/ToothPaste.glb" 
                        scrollDeltaRef={scrollDeltaRef}
                        translateX={slideConfig.translateX}
                        translateY={slideConfig.translateY}
                        translateZ={slideConfig.translateZ}
                        autorotate={slideConfig.autorotate}
                    />
                </Canvas>
            </div>
        </div>
    );
}
