import React, { useRef } from 'react';
import { Canvas, useLoader, useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const Model = ({ url, scrollDeltaRef }) => {
    const groupRef = useRef();
    const gltf = useLoader(GLTFLoader, url);
    const targetRotation = useRef(0);
    const autorotationDirection = useRef(1);
    const rotationSpeed = 0.001;

    useFrame(() => {
        if (!groupRef.current) return;

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
    return (
        <div className="absolute inset-0 pointer-events-none">
            <div
                className={`
                relative w-full h-full
                transition-transform duration-1000 ease-in-out
                ${isMobile ? 'translate-x-0' : (currentSlide === 0 ? '-translate-x-[28%]' : 'translate-x-0')}
                `}
            >
                <Canvas className="w-full h-full">
                    <ambientLight intensity={isMobile ? 0.2 : (currentSlide === 0 ? 2 : 1)} />
                    <directionalLight
                        position={[0, 2, 5]}
                        intensity={isMobile ? 0.1 : (currentSlide === 0 ? 1 : 0.1)}
                        castShadow
                    />
                    <Model url="/ToothPaste.glb" scrollDeltaRef={scrollDeltaRef} />
                </Canvas>
            </div>
        </div>
    );
}
