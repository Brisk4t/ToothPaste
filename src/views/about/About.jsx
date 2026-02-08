import React, { useState, useRef, useEffect } from 'react';
import ModelContainer from './sections/ModelContainer';
import HeroSection from './sections/HeroSection';
import WhySection from './sections/WhySection';
import SecuritySection from './sections/SecuritySection';
import CTASection from './sections/CTASection';
import GridBackground from '../../components/GridBackground';
import { appColors } from '../../styles/colors';
import { useBreakpoint } from '../../services/useBreakpoint';

export default function About() {
    const [currentSlide, setCurrentSlide] = useState(0);
    const { isMobile } = useBreakpoint();
    const scrollDeltaRef = useRef(0);
    const containerRef = useRef(null);
    const maxSlides = 4;
    const scrollThreshold = useRef(0);
    const scrollSensitivity = 1000; // Adjust this value to change how many clicks required

    // Define filled squares for each section and screen size
    const getSquaresForScreenSize = () => {
        if (isMobile) {
            return {
                hero: [
                    { row: 20, col: 1, color: appColors.secondary },
                    { row: 20, col: 3, color: appColors.orange },
                    { row: 20, col: 5, color: appColors.primary }
                ],
                why: [
                    { row: 5, col: 2, color: appColors.primary },
                    { row: 6, col: 3, color: appColors.secondary }
                ],
                security: [
                    { row: 8, col: 4, color: appColors.primary },
                    { row: 9, col: 5, color: appColors.secondary }
                ],
                cta: [
                    { row: 11, col: 6, color: appColors.primary },
                    { row: 12, col: 7, color: appColors.secondary }
                ]
            };
        } else {
            return {
                hero: [
                    { row: 20, col: 44, color: appColors.secondary },
                    { row: 20, col: 46, color: appColors.orange },
                    { row: 20, col: 48, color: appColors.primary }
                ],
                why: [
                    { row: 5, col: 2, color: appColors.primary },
                    { row: 6, col: 3, color: appColors.secondary }
                ],
                security: [
                    { row: 8, col: 4, color: appColors.primary },
                    { row: 9, col: 5, color: appColors.secondary }
                ],
                cta: [
                    { row: 11, col: 6, color: appColors.primary },
                    { row: 12, col: 7, color: appColors.secondary }
                ]
            };
        }
    };

    const sectionSquares = getSquaresForScreenSize();

    // Show squares only for current section
    const currentSectionSquares = (() => {
        switch(currentSlide) {
            case 0: return sectionSquares.hero;
            case 1: return sectionSquares.why;
            case 2: return sectionSquares.security;
            case 3: return sectionSquares.cta;
            default: return [];
        }
    })();

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
        //  Background with grid pattern - also serves as scroll container
        <div ref={containerRef} className="relative flex-1 w-full bg-transparent text-text overflow-hidden">
            {/* Colored squares overlay - no grid lines */}
            <GridBackground
                filledSquares={currentSectionSquares}
                squareSize={25}
                borderColor="transparent"
                borderWidth={0}
            />

            {/* 3D Model Container */}
            <ModelContainer 
                currentSlide={currentSlide} 
                scrollDeltaRef={scrollDeltaRef}
                isMobile={isMobile}
            />

            {/* Sections */}
            <HeroSection 
                currentSlide={currentSlide} 
                getSectionOpacity={getSectionOpacity}
            />
            <WhySection 
                currentSlide={currentSlide} 
                getSectionOpacity={getSectionOpacity}
            />
            <SecuritySection 
                currentSlide={currentSlide} 
                getSectionOpacity={getSectionOpacity}
            />
            <CTASection 
                currentSlide={currentSlide} 
                getSectionOpacity={getSectionOpacity}
            />
        </div>
    );
}