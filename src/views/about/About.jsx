import React, { useState, useRef, useEffect, useMemo } from 'react';
import ModelContainer from './sections/ModelContainer';
import HeroSection from './sections/HeroSection';
import WhySection from './sections/WhySection';
import SecuritySection from './sections/SecuritySection';
import CTASection from './sections/CTASection';
import GridBackground from '../../components/shared/GridBackground';
import { Typography } from "@material-tailwind/react";
import { appColors } from '../../styles/colors';
import { useBreakpoint } from '../../services/useBreakpoint';
import {LockClosedIcon} from "@heroicons/react/24/outline";


const star = [
    { row: 1, col: 0, color: appColors.primary },
    { row: 1, col: 3, color: appColors.primary },
    { row: 1, col: 6, color: appColors.primary },
    
    { row: 2, col: 1, color: appColors.primary },
    { row: 2, col: 3, color: appColors.primary },
    { row: 2, col: 5, color: appColors.primary },

    { row: 3, col: 2, color: appColors.primary },
    { row: 3, col: 3, color: appColors.primary },
    { row: 3, col: 4, color: appColors.primary },

    { row: 4, col: 4, color: appColors.primary },
    { row: 4, col: 3, color: appColors.primary },
    { row: 4, col: 2, color: appColors.primary },


    { row: 5, col: 1, color: appColors.primary },
    { row: 5, col: 3, color: appColors.primary },
    { row: 5, col: 5, color: appColors.primary },
    
    { row: 6, col: 0, color: appColors.primary },
    { row: 6, col: 3, color: appColors.primary },
    { row: 6, col: 6, color: appColors.primary },
]

const bluetoothSquares = [
    { row: 1, col: 2, color: appColors.text },
    { row: 3, col: 0, color: appColors.text },
    { row: 2, col: 2, color: appColors.text },
    { row: 4, col: 1, color: appColors.text },
    { row: 2, col: 4, color: appColors.text },
    { row: 3, col: 2, color: appColors.text },

    { row: 3, col: 5, color: appColors.text },
    { row: 4, col: 2, color: appColors.text },
    { row: 4, col: 4, color: appColors.text },
    
    { row: 1, col: 3, color: appColors.text },
    { row: 5, col: 3, color: appColors.text },
    
    { row: 6, col: 1, color: appColors.text },
    { row: 5, col: 2, color: appColors.text },
    { row: 6, col: 4, color: appColors.text },
    { row: 6, col: 2, color: appColors.text },
    { row: 7, col: 5, color: appColors.text },
    { row: 7, col: 0, color: appColors.text },
    { row: 7, col: 2, color: appColors.text },
    { row: 8, col: 4, color: appColors.text },
    { row: 9, col: 3, color: appColors.text },
    { row: 8, col: 2, color: appColors.text },
    { row: 9, col: 2, color: appColors.text },
];

// Generate repeating pattern of 3 stars with equal spacing
const generateRepeatingStars = (cols, rowOffset = 20) => {
    const starWidth = 7;
    const colors = [appColors.secondary, appColors.orange, appColors.primary];
    const groupSpacing = 12;
    const groupSize = groupSpacing * 3;
    
    const stars = [];
    let col = 0;
    
    while (col < cols) {
        for (let i = 0; i < 3; i++) {
            const starCol = col + (i * groupSpacing);
            if (starCol + starWidth <= cols) {
                stars.push(
                    ...star.map(square => ({
                        ...square,
                        col: square.col + starCol,
                        row: square.row + rowOffset,
                        color: colors[i],
                        opacity: 0.3
                    }))
                );
            }
        }
        col += groupSize;
    }
    
    return stars;
};

export default function About() {
    const [currentSlide, setCurrentSlide] = useState(0);
    const [gridDimensions, setGridDimensions] = useState({ rows: 0, cols: 0, width: 0, height: 0 });
    const { isMobile } = useBreakpoint();
    const scrollDeltaRef = useRef(0);
    const containerRef = useRef(null);
    const maxSlides = 4;
    const scrollThreshold = useRef(0);
    const scrollSensitivity = 1000; // Adjust this value to change how many clicks required
    const touchSensitivity = 300; // Pixels of swipe to trigger slide change
    const lastTouchYRef = useRef(0);
    const lastSlideChangeTimeRef = useRef(0);
    const slideChangeCooldownRef = useRef(500); // Cooldown in milliseconds

    // Define filled squares for each section and screen size
    const getSquaresForScreenSize = () => {
        if (isMobile) {
            return {
                hero: [
                    { row: 10, col: 1, color: appColors.secondary },
                    { row: 10, col: 3, color: appColors.orange },
                    { row: 10, col: 5, color: appColors.primary },
                ],
                why: generateRepeatingStars(gridDimensions.cols),
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
                    { row: 20, col: 48, color: appColors.primary },

                ],
                why: generateRepeatingStars(gridDimensions.cols),
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

    const sectionSquares = useMemo(() => getSquaresForScreenSize(), [gridDimensions, isMobile]);

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
        // Common handler for both wheel and touch scroll input
        const handleScrollInput = (delta, threshold) => {
            // Accumulate scroll delta for model rotation
            scrollDeltaRef.current += delta;

            // Check if cooldown has expired
            const now = Date.now();
            const isOnCooldown = now - lastSlideChangeTimeRef.current < slideChangeCooldownRef.current;

            if (!isOnCooldown) {
                // Accumulate scroll delta for slide navigation
                scrollThreshold.current += delta;

                // Check if accumulated scroll exceeds threshold
                if (Math.abs(scrollThreshold.current) >= threshold) {
                    if (scrollThreshold.current > 0) {
                        setCurrentSlide(prev => Math.min(prev + 1, maxSlides - 1));
                    } else {
                        setCurrentSlide(prev => Math.max(prev - 1, 0));
                    }
                    scrollThreshold.current = 0;
                    lastSlideChangeTimeRef.current = now;
                }
            }
        };

        const handleWheel = (event) => {
            event.preventDefault();
            handleScrollInput(event.deltaY, scrollSensitivity);
        };

        const handleTouchStart = (event) => {
            lastTouchYRef.current = event.touches[0].clientY;
        };

        const handleTouchMove = (event) => {
            const currentTouchY = event.touches[0].clientY;
            const touchDelta = lastTouchYRef.current - currentTouchY;
            handleScrollInput(touchDelta, touchSensitivity);
            lastTouchYRef.current = currentTouchY;
        };

        window.addEventListener('wheel', handleWheel, { passive: false });
        window.addEventListener('touchstart', handleTouchStart, { passive: true });
        window.addEventListener('touchmove', handleTouchMove, { passive: true });
        
        return () => {
            window.removeEventListener('wheel', handleWheel);
            window.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchmove', handleTouchMove);
        };
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
                borderColor={appColors.hover}
                borderWidth={0}
                onDimensionsChange={setGridDimensions}
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

            {/* Barcode ToothPaste */}
            <div className='rotate-90 absolute bottom-0 right-0 -translate-y-full translate-x-[43%] pointer-events-none'>
                            <Typography style={{ fontFamily: '"Libre Barcode 39 Extended", system-ui' }} className="text-8xl leading-relaxed">ToothPaste</Typography>
            </div>
        </div>
    );
}