import React, { useState, useRef, useEffect } from 'react';
import ModelContainer from './sections/ModelContainer';
import HeroSection from './sections/HeroSection';
import WhySection from './sections/WhySection';
import SecuritySection from './sections/SecuritySection';
import CTASection from './sections/CTASection';

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
        <div ref={containerRef} className=" relative flex-1 w-full bg-background text-text overflow-hidden" style={{
            backgroundImage: `
                linear-gradient(0deg, transparent 24%, rgba(255, 255, 255, 0.05) 25%, rgba(255, 255, 255, 0.05) 26%, transparent 27%, transparent 74%, rgba(255, 255, 255, 0.05) 75%, rgba(255, 255, 255, 0.05) 76%, transparent 77%, transparent),
                linear-gradient(90deg, transparent 24%, rgba(255, 255, 255, 0.05) 25%, rgba(255, 255, 255, 0.05) 26%, transparent 27%, transparent 74%, rgba(255, 255, 255, 0.05) 75%, rgba(255, 255, 255, 0.05) 76%, transparent 77%, transparent)
            `,
            backgroundSize: '50px 50px'
        }}>

            {/* 3D Model Container */}
            <ModelContainer currentSlide={currentSlide} scrollDeltaRef={scrollDeltaRef} />

            {/* Sections */}
            <HeroSection currentSlide={currentSlide} getSectionOpacity={getSectionOpacity} />
            <WhySection currentSlide={currentSlide} getSectionOpacity={getSectionOpacity} />
            <SecuritySection currentSlide={currentSlide} getSectionOpacity={getSectionOpacity} />
            <CTASection currentSlide={currentSlide} getSectionOpacity={getSectionOpacity} />
        </div>
    );
}