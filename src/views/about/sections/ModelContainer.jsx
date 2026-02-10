import React, { useRef } from 'react';
import { Canvas, useLoader, useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Per-slide configuration: lighting intensity and translation
const SLIDE_CONFIG = {
    mobile: [
        { ambient: 0.2, directional: 0.1, translateX: 0, translateY: 0 },      // Slide 0 - Hero
        { ambient: 0.3, directional: 0.15, translateX: 0, translateY: 0 },     // Slide 1 - Why
        { ambient: 0.3, directional: 0.15, translateX: 0, translateY: 0 },     // Slide 2 - Security
        { ambient: 0.2, directional: 0.1, translateX: 0, translateY: 0 }       // Slide 3 - CTA
    ],
    desktop: [
        { ambient: 2, directional: 1, translateX: -200, translateY: 0 },          // Slide 0 - Hero
        { ambient: 2, directional: 1, translateX: -2, translateY: 0 },       // Slide 1 - Why
        { ambient: 1, directional: 0.1, translateX: 5, translateY: -5 },       // Slide 2 - Security
        { ambient: 1, directional: 0.1, translateX: 0, translateY: 10 }        // Slide 3 - CTA
    ]
};

const Model = ({ url, scrollDeltaRef, translateX, translateY }) => {
    const groupRef = useRef();
    const gltf = useLoader(GLTFLoader, url);
    const targetRotation = useRef(0);
    const autorotationDirection = useRef(1);
    const rotationSpeed = 0.005;
    
    // Position interpolation
    const currentPos = useRef([0, 0]);
    const targetX = useRef((translateX / 100) * 3);
    const targetY = useRef((translateY / 100) * 3);
    const interpolationSpeed = 0.08;

    // Update target position when props change
    useFrame(() => {
        targetX.current = (translateX / 100) * 3;
        targetY.current = (translateY / 100) * 3;
    });

    useFrame(() => {
        if (!groupRef.current) return;

        // Interpolate position
        currentPos.current[0] += (targetX.current - currentPos.current[0]) * interpolationSpeed;
        currentPos.current[1] += (targetY.current - currentPos.current[1]) * interpolationSpeed;
        groupRef.current.position.x = currentPos.current[0];
        groupRef.current.position.y = -0.1 + currentPos.current[1];

        // Interpolate rotation
        targetRotation.current += rotationSpeed * autorotationDirection.current;

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
        <group ref={groupRef} position={[0, -0.1, -2]}>
            <spotLight
                position={[0, 3, 1]}
                angle={0.3}
                penumbra={0.2}
                intensity={11}
                castShadow
            />

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
                    />
                </Canvas>
            </div>
        </div>
    );
}
