// tailwind.config.js
import { mtConfig } from "@material-tailwind/react";

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@material-tailwind/react/**/*.{js,ts,jsx,tsx}",
  ],

  // Tailwind CSS Config
  theme: {
    extend: {
      fontFamily: {
        // sans: ['Inter', 'ui-sans-serif', 'system-ui'],
        header: ['Roboto Mono', 'sans-serif'],
        body: ['Ubuntu Sans Mono', 'sans-serif'],
        barcode: ['Libre Barcode 39', 'sans-serif']
      },
      colors: {
        primary: '#00A878',
        secondary: '#DD4058',
        accent: '#DE6240',
        background: '#000000',
        text: '#FFFFFF',
        shelf: '#111111',
        hover: '#222222',
        orange: '#DE6240',
      },
      keyframes: {
        fadeout: {
          '0%': { opacity: '1' },
          '90%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
      },
      animation: {
        fadeout: 'fadeout linear forwards',
      },
    },
  },

  // Material Tailwind Config
  plugins: [mtConfig]

};
