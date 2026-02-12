// tailwind.config.js
import { mtConfig } from "@material-tailwind/react";
import { appColors } from "./src/styles/colors.js";

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
        sans: ['Ubuntu Sans Mono', 'sans-serif'],
        header: ['Roboto Mono', 'sans-serif'],
        body: ['Ubuntu Sans Mono', 'sans-serif'],
        barcode: ['Libre Barcode 39 Extended', 'system-ui'],
      },
      colors: {
        ...appColors,
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
  plugins: [
    function ({ addComponents }) {
      addComponents({
        '.whybox': {
          '@apply flex-1 border-2 rounded-lg bg-ink/80 shadow-lg h-full p-2 md:p-3 flex flex-col items-center justify-center gap-4 md:gap-3': {}
        }
      })
    },
    mtConfig
  ]

};
