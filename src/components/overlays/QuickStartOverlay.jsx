import React, { useState, useEffect, useMemo } from 'react';
import { Button, Typography } from "@material-tailwind/react";
import ToothPaste from "../../assets/ToothPaste.png";
import {
    LockClosedIcon,
    WifiIcon,
    CheckCircleIcon
} from "@heroicons/react/24/outline";

// Shared step objects across all views
const WELCOME_STEP = {
    title: (
        <>
            <div className="inline-flex items-center gap-1 mb-3">
                <img src={ToothPaste} alt="ToothPaste" className="h-12 w-12 mr-4" />
                <Typography type="h3" className="font-header">Welcome To ToothPaste</Typography>
            </div>
        </>
    ),
    description: (
        <>
            <div className="mb-6">
                <Typography type="paragraph" className="font-body text-xl">
                    A tool to quickly capture and send clipboard data across devices without compromising security.
                </Typography>
            </div>

            <div className="flex mb-6 flex-col gap-5 text-lg">
                <div className="flex gap-3">
                    <LockClosedIcon className="h-6 w-6 text-primary font-bold" />
                    <Typography className="text-lg">End-to-end encrypted communication</Typography>
                </div>
                <div className="flex gap-3">
                    <WifiIcon className="h-6 w-6 text-primary font-bold" />
                    <Typography className="text-lg">Real-time keyboard and mouse capture</Typography>
                </div>
                <div className="flex gap-3">
                    <CheckCircleIcon className="h-6 w-6 text-primary font-bold" />
                    <Typography className="text-lg">Easy device pairing and management</Typography>
                </div>
            </div>
        </>
    ),
    targetSelector: null,
    gridColumn: 4,
    gridRow: 5,
    columnSpan: 4,
    rowSpan: 3,
    spotlightRadius: 100,
    spotlightGridColumn: 5,
    spotlightGridRow: 6,
    gradientIntensity: 0.8,
};

const NAV_MENU_STEP = {
    title: 'Navigation Menu',
    description: 'Toggle the menu to switch between Live Capture, Bulk Send, and other features.',
    targetSelector: '#navbar',
    gridColumn: 4,
    gridRow: 2,
    columnSpan: 3,
    rowSpan: 1,
};

const CONNECTION_STATUS_STEP = {
    title: (<><Typography type="h4" className="font-header">Connect Button</Typography></>),
    description: (
        <>
            <div className="mb-4">
                <Typography className="text-xl font-body">Click to connect to a ToothPaste device via BLE.</Typography>
            </div>
            <div className="border border-2 border-ash mb-4"></div>
            <div className="">
                <Typography className="text-lg font-body mb-2">Different border colors indicate connection status:</Typography>
                <ul className="list-disc list-inside space-y-1 text-sm">
                    <Typography className="font-body"><span className="text-primary font-body font-semibold">Green</span> - Connected</Typography>
                    <Typography className="font-body"><span className="text-orange font-body font-semibold">Orange</span> - Connected, Not Paired</Typography>
                    <Typography className="font-body"><span className="text-secondary font-body font-semibold">Red</span> - Disconnected</Typography>
                </ul>
            </div>
            <br/>
            <Typography className="text-lg font-body font-extralight">Once connected, <span className="font-semibold">hold this button </span>to rename the connected device.</Typography>

        </>
    ),
    targetSelector: '#connection-button',
    gridColumn: 8,
    gridRow: 2,
    columnSpan: 3,
    rowSpan: 1,
};

const stepsMap = {
    live: [
        WELCOME_STEP,
        { ...NAV_MENU_STEP, spotlightRadius: 400, spotlightGridColumn: 5.5, spotlightGridRow: 1, gradientIntensity: 0.7 },
        {
            title: 'Live Capture',
            description: 'Capture keyboard and mouse input in real-time. Type in the input area to capture commands.',
            targetSelector: '#live-capture-input',
            gridColumn: 4,
            gridRow: 1,
            columnSpan: 3,
            rowSpan: 1,
            spotlightRadius: 1000,
            spotlightGridColumn: 5.5,
            spotlightGridRow: 6,
            gradientIntensity: 0.8,
        },
        {
            title: 'Keyboard Preview',
            description: 'If you need some more stimulation while you type.',
            targetSelector: '#keyboard-container',
            gridColumn: 1,
            gridRow: 3,
            columnSpan: 2,
            rowSpan: 1,
            spotlightRadius: 500,
            spotlightGridColumn: 1,
            spotlightGridRow: 2,
            gradientIntensity: 0.85,
        },
        { ...CONNECTION_STATUS_STEP, spotlightRadius: 300, spotlightGridColumn: 10, spotlightGridRow: 1, gradientIntensity: 0.7 },
    ],
    paste: [
        WELCOME_STEP,
        { ...NAV_MENU_STEP, spotlightRadius: 800, spotlightGridColumn: 5.5, spotlightGridRow: 1, gradientIntensity: 0.7 },
        {
            title: 'Bulk Send',
            description: 'Send clipboard data directly from your clipboard to your paired device. Paste or type content here to send it securely.',
            targetSelector: '#bulk-send-container',
            gridColumn: 5,
            gridRow: 9,
            columnSpan: 2,
            rowSpan: 1,
            spotlightRadius: 1000,
            spotlightGridColumn: 5.8,
            spotlightGridRow: 10,
            gradientIntensity: 0.8,
        },
        { ...CONNECTION_STATUS_STEP, spotlightRadius: 300, spotlightGridColumn: 10, spotlightGridRow: 1, gradientIntensity: 0.7 },
    ],
    about: [
        WELCOME_STEP,
        { ...NAV_MENU_STEP, spotlightRadius: 120, spotlightGridColumn: 5, spotlightGridRow: 1, gradientIntensity: 0.6 },
        { ...CONNECTION_STATUS_STEP, spotlightRadius: 150, spotlightGridColumn: 9, spotlightGridRow: 2, gradientIntensity: 0.7 },
    ],
};

function Spotlight({ target, padding = 10 }) {
    if (!target) return null;

    const rect = target.getBoundingClientRect();
    return (
        <div
            className="absolute border-2 border-primary"
            style={{
                top: rect.top - padding,
                left: rect.left - padding,
                width: rect.width + padding * 2,
                height: rect.height + padding * 2,
                pointerEvents: 'none',
                borderRadius: '8px',
                animation: 'pulse 2s infinite',
            }}
        />
    );
}

export default function QuickStartOverlay({ onChangeOverlay, activeView = 'live' }) {
    const [currentStep, setCurrentStep] = useState(0);
    const [targetElement, setTargetElement] = useState(null);

    const steps = stepsMap[activeView] || stepsMap.live;

    useEffect(() => {
        const timer = setTimeout(() => {
            const selector = steps[currentStep].targetSelector;
            if (selector) {
                const element = document.querySelector(selector);
                setTargetElement(element);
            } else {
                setTargetElement(null);
            }
        }, 100);

        return () => clearTimeout(timer);
    }, [currentStep, activeView, steps]);

    const getGridPosition = (step) => {
        return {
            gridColumn: `${step.gridColumn} / span ${step.columnSpan}`,
            gridRow: `${step.gridRow}`,
        };
    };

    const getSpotlightMask = () => {
        if (!targetElement) return 'none';

        const rect = targetElement.getBoundingClientRect();
        const radius = steps[currentStep].spotlightRadius || 100;
        const spotlightGridCol = steps[currentStep].spotlightGridColumn || 5;
        const spotlightGridRow = steps[currentStep].spotlightGridRow || 5;

        // Calculate grid-based center position (10x10 grid)
        const cellWidth = window.innerWidth / 10;
        const cellHeight = window.innerHeight / 10;
        const centerX = (spotlightGridCol - 0.5) * cellWidth;
        const centerY = (spotlightGridRow - 0.5) * cellHeight;

        return `radial-gradient(circle ${radius}px at ${centerX}px ${centerY}px, transparent, black)`;
    };

    const handleNext = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(currentStep + 1);
        } else {
            handleComplete();
        }
    };

    const handlePrevious = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    const handleComplete = () => {
        localStorage.setItem('quickstart_viewed', 'true');
        onChangeOverlay(null);
    };

    const handleSkip = () => {
        localStorage.setItem('quickstart_viewed', 'true');
        onChangeOverlay(null);
    };

    const step = steps[currentStep];
    const isLastStep = currentStep === steps.length - 1;

    const gridStyles = useMemo(() => getGridPosition(step), [currentStep, step]);

    return (
        <div className="fixed inset-0 z-[9999]">
            {/* Overlay with mask to show spotlight */}
            <div
                className="absolute inset-0"
                onClick={handleSkip}
                style={{
                    opacity: `${steps[currentStep].gradientIntensity || 0.6}`,
                    backgroundColor: `rgba(0, 0, 0, ${steps[currentStep].gradientIntensity || 0.6})`,
                    maskImage: getSpotlightMask(),
                    WebkitMaskImage: getSpotlightMask(),
                }}
            />

            {/* Spotlight */}
            {targetElement && (
                <Spotlight target={targetElement} />
            )}

            {/* Grid Container */}
            <div
                className="fixed inset-0 grid gap-4 p-4 pointer-events-none z-[10001]"
                style={{
                    gridTemplateColumns: 'repeat(10, 1fr)',
                    gridTemplateRows: 'repeat(10, 1fr)',
                }}
            >
                {/* Tooltip Card */}
                <div
                    key={currentStep}
                    className="bg-ink p-5 rounded-lg shadow-lg pointer-events-auto flex flex-col overflow-visible"
                    style={{...gridStyles, height: 'auto'}}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex justify-between items-start mb-3">
                        <Typography type="h5" className="font-header text-text">
                            {step.title}
                        </Typography>
                        <span className="text-xs font-header text-primary ml-2">
                            {currentStep + 1} / {steps.length}
                        </span>
                    </div>

                    <div className="flex-1 font-body text-text mb-4 text-sm leading-relaxed">
                        {step.description}
                    </div>

                    <div className="flex gap-3 flex-wrap">
                        <Button
                            onClick={handleSkip}
                            className="flex-1 min-w-fit h-10 bg-ash border-ash text-text font-header normal-case"
                        >
                            Skip
                        </Button>
                        {currentStep > 0 && (
                            <Button
                                onClick={handlePrevious}
                                className="flex-1 min-w-fit h-10 bg-orange border-ash text-text font-header normal-case"
                            >
                                Previous
                            </Button>
                        )}
                        <Button
                            onClick={handleNext}
                            className="flex-1 min-w-fit h-10 bg-primary text-text font-header normal-case"
                        >
                            {isLastStep ? 'Done' : 'Next'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
