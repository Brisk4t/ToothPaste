import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
// import { ThemeProvider } from '@material-tailwind/react';
// import { theme } from './styles/theme';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* <ThemeProvider value={theme}> */}
      <App />
    {/* </ThemeProvider> */}
  </React.StrictMode>
);