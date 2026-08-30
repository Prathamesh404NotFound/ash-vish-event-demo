import {StrictMode, useState, useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { getSessionId } from './contexts/BookingContext';
import { SplashScreen } from './components/SplashScreen';

// Publish the stable session ID globally so SeatMap (event page) and the
// payment hooks all use the same session identity as the booking wizard.
(window as any).__SESSION_ID = getSessionId();
(window as any).__API_BASE_URL = (import.meta as any).env?.VITE_API_URL
  ? String((import.meta as any).env.VITE_API_URL).replace(/\/$/, '')
  : '';

function Root() {
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashComplete = useCallback(() => setSplashDone(true), []);

  return (
    <>
      {!splashDone && <SplashScreen onComplete={handleSplashComplete} />}
      <App />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
