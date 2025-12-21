// tailwind.config.js
import { mtConfig } from "@material-tailwind/react";

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@material-tailwind/react/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // fontFamily: {
      //   sans: ['Inter', 'ui-sans-serif', 'system-ui'],
      // },
      // colors: {
      //   primary: '#00A878',
      //   secondary: '#DD4058',
      //   accent: '#3b82f6',
      //   background: '#000000',
      //   text: '#FFFFFF',
      //   shelf: '#111111',
      //   hover: '#222222',
      //   orange: '#DE6240',
      // },
      // keyframes: {
      //   fadeout: {
      //     '0%': { opacity: '1' },
      //     '90%': { opacity: '1' },
      //     '100%': { opacity: '0' },
      //   },
      // },
      // animation: {
      //   fadeout: 'fadeout linear forwards',
      // },
    },
  },
  // safelist: [
  //   'text-shelf', 'bg-shelf', 'border-shelf',
  //   'text-hover', 'bg-hover', 'border-hover',
  //   'text-orange', 'bg-orange', 'border-orange'
  // ],
  plugins: [mtConfig],

};
