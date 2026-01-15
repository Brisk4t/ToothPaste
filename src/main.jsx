import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { ErrorBoundary } from "react-error-boundary";

function ErrorFallback({ error }) {
  return <div>Oops: {error.message}</div>;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary FallbackComponent={ErrorFallback} onError={(error) => console.error(error)}>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);