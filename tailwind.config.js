const { list } = require("@material-tailwind/react");
const withMT = require("@material-tailwind/react/utils/withMT");
module.exports = withMT({
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors:{
      'primary': '#00A878',
      'secondary': '#DD4058',
      'accent': '#3b82f6',
      'background': '#000000',
      'text': '#FFFFFF',
      'shelf': '#111111',
      'hover': '#222222',
      },
    },  
  },
  plugins: [],
});
