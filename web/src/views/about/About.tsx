import { useState, useRef, useEffect } from 'react';
import HeroSection from './sections/HeroSection';
import WhySection from './sections/WhySection';
import CTASection from './sections/CTASection';

export default function About() {
    const [currentSlide, setCurrentSlide] = useState(0);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const maxSlides = 3;
    const scrollThreshold = useRef(0);
    const scrollSensitivity = 500; // How many pixels of scroll to trigger slide change
    const touchSensitivity = 100; // Pixels of swipe to trigger slide change
    const pointerStartYRef = useRef(0);
    const isPointerDownRef = useRef(false);
    const lastSlideChangeTimeRef = useRef(0);
    const slideChangeCooldownRef = useRef(500); // Cooldown in milliseconds

    useEffect(() => {
        // Common handler for scroll input (pointer and wheel)
        // scrollAmount: raw input value (pixels moved)
        // slideChangeThreshold: minimum pixels needed to trigger slide change
        const handleScrollInput = (scrollAmount: number, slideChangeThreshold: number) => {
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
        const handleTouchStart = (event: TouchEvent) => {
            pointerStartYRef.current = event.touches[0].clientY;
            isPointerDownRef.current = true;
        };

        const handleTouchMove = (event: TouchEvent) => {
            if (isPointerDownRef.current) {
                const currentY = event.touches[0].clientY;
                const touchDelta = pointerStartYRef.current - currentY;
                handleScrollInput(touchDelta, touchSensitivity);
                pointerStartYRef.current = currentY;
            }
        };

        const handleTouchEnd = () => {
            isPointerDownRef.current = false;
        };

        const handleWheel = (event: WheelEvent) => {
            event.preventDefault();
            handleScrollInput(event.deltaY, scrollSensitivity);
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
    const getSectionOpacity = (sectionIndex: number): number => {
        return currentSlide === sectionIndex ? 1 : 0;
    };

    return (
        // Scroll container for the slide sections
        <div ref={containerRef} className="relative flex-1 w-full bg-transparent text-text overflow-hidden" style={{ touchAction: 'none' }}>
            {/* Sections */}
            <HeroSection 
                currentSlide={currentSlide} 
                getSectionOpacity={getSectionOpacity}
            />
            <WhySection
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