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
    const scrollSensitivity = 500; // How many pixels of scroll to trigger slide change
    const touchSensitivity = 100; // Pixels of swipe to trigger slide change
    const pointerStartYRef = useRef(0);
    const isPointerDownRef = useRef(false);
    const lastSlideChangeTimeRef = useRef(0);
    const slideChangeCooldownRef = useRef(500); // Cooldown in milliseconds

    // Define filled squares for each section and screen size
    const getSquaresForScreenSize = () => {
        const { rows, cols } = gridDimensions;
        if (rows === 0 || cols === 0) return { hero: [], why: [], security: [], cta: [] };

        // Generate white squares for right half of grid
        const whiteSquaresRightHalf = [];
        const halfCol = Math.ceil(cols / 2);
        for (let row = 0; row < rows; row++) {
            for (let col = halfCol; col < cols; col++) {
                whiteSquaresRightHalf.push({ row, col, color: appColors.text });
            }
        }

        if (isMobile) {
            // Mobile proportional positions
            const startCol = 1;
            const twoThirdCol = Math.floor((cols * 2) / 3);
            const thirdRow = Math.floor(rows / 3);
            const twoThirdRow = Math.floor((rows * 2) / 3);

            return {
                hero: [
                    { row: thirdRow, col: startCol, color: appColors.secondary },
                    { row: thirdRow, col: startCol + 2, color: appColors.orange },
                    { row: thirdRow, col: startCol + 4, color: appColors.primary },
                ],
                why: generateRepeatingStars(cols),
                security: [
                    { row: twoThirdRow, col: startCol + 2, color: appColors.primary },
                    { row: twoThirdRow + 1, col: startCol + 3, color: appColors.secondary },

                ],
                cta: [
                    { row: twoThirdRow, col: twoThirdCol, color: appColors.primary },
                    { row: twoThirdRow + 1, col: twoThirdCol + 1, color: appColors.secondary }
                ]
            };
        } 
        
        else {
            // Desktop proportional positions
            const thirdCol = Math.floor(cols * (3/7));
            const twoThirdCol = Math.floor((cols * 2) / 3);
            const thirdRow = Math.floor(rows * (3/7));
            const twoThirdRow = Math.floor((rows * 2) / 3);

            return {
                hero: [
                    { row: thirdRow, col: thirdCol, color: appColors.secondary },
                    { row: thirdRow, col: thirdCol + 2, color: appColors.orange },
                    { row: thirdRow, col: thirdCol + 4, color: appColors.primary },

                ],
                why: [...generateRepeatingStars(cols)],
                security: [
                    { row: twoThirdRow, col: thirdCol + 4, color: appColors.primary },
                    { row: twoThirdRow + 1, col: thirdCol + 5, color: appColors.secondary },
                ],
                cta: [
                    { row: twoThirdRow, col: twoThirdCol, color: appColors.primary },
                    { row: twoThirdRow + 1, col: twoThirdCol + 1, color: appColors.secondary }
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
        // Common handler for scroll input (pointer and wheel)
        // scrollAmount: raw input value (pixels moved)
        // slideChangeThreshold: minimum pixels needed to trigger slide change
        // modelRotationScale: multiplier for 3D model rotation (separate from slide changes)
        const handleScrollInput = (scrollAmount, slideChangeThreshold, modelRotationScale = 1) => {
            // Apply scroll amount to 3D model rotation
            scrollDeltaRef.current += scrollAmount * modelRotationScale;

            // Check if cooldown has expired
            const now = Date.now();
            const isOnCooldown = now - lastSlideChangeTimeRef.current < slideChangeCooldownRef.current;

            if (!isOnCooldown) {
                // Accumulate scroll for slide navigation (independent of model rotation)
                scrollThreshold.current += scrollAmount;

                // Check if accumulated scroll exceeds threshold to change slides
                if (Math.abs(scrollThreshold.current) >= slideChangeThreshold) {
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

        // Unified touch events handler
        const handleTouchStart = (event) => {
            pointerStartYRef.current = event.touches[0].clientY;
            isPointerDownRef.current = true;
        };

        const handleTouchMove = (event) => {
            if (isPointerDownRef.current) {
                const currentY = event.touches[0].clientY;
                const touchDelta = pointerStartYRef.current - currentY;
                // Touch: reduced model rotation (0.5x), normal slide threshold
                handleScrollInput(touchDelta, touchSensitivity, 5);
                pointerStartYRef.current = currentY;
            }
        };

        const handleTouchEnd = () => {
            isPointerDownRef.current = false;
        };

        const handleWheel = (event) => {
            event.preventDefault();
            // Wheel: normal model rotation (1x), high slide threshold
            handleScrollInput(event.deltaY, scrollSensitivity, 1);
        };

        window.addEventListener('wheel', handleWheel, { passive: false });
        window.addEventListener('touchstart', handleTouchStart, { passive: true });
        window.addEventListener('touchmove', handleTouchMove, { passive: true });
        window.addEventListener('touchend', handleTouchEnd, { passive: true });
        
        return () => {
            window.removeEventListener('wheel', handleWheel);
            window.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleTouchEnd);
        };
    }, []);

    // Calculate which section should be visible based on current slide
    const getSectionOpacity = (sectionIndex) => {
        return currentSlide === sectionIndex ? 1 : 0;
    };

    return (
        //  Background with grid pattern - also serves as scroll container
        <div ref={containerRef} className="relative flex-1 w-full bg-transparent text-text overflow-hidden" style={{ touchAction: 'none' }}>
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
            {/* <div className='rotate-90 absolute bottom-0 right-0 -translate-y-full translate-x-[43%] pointer-events-none'>
                            <Typography style={{ fontFamily: '"Libre Barcode 39 Extended", system-ui'}} className="text-8xl leading-relaxed text-dust">ToothPaste</Typography>
            </div> */}
        </div>
    );
}