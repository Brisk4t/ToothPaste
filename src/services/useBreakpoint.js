import { useEffect, useState } from 'react';
import resolveConfig from 'tailwindcss/resolveConfig';
import tailwindConfig from '../../tailwind.config.js';

const fullConfig = resolveConfig(tailwindConfig);
const breakpoints = {
  sm: parseInt(fullConfig.theme.screens.sm),
  md: parseInt(fullConfig.theme.screens.md),
  lg: parseInt(fullConfig.theme.screens.lg),
  xl: parseInt(fullConfig.theme.screens.xl),
};

export const useBreakpoint = () => {
  const [width, setWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return {
    width,
    isMobile: width < breakpoints.xl,
    isDesktop: width >= breakpoints.xl,
    breakpoints,
  };
};
