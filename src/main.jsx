import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Service worker registration lives in src/hooks/useServiceWorkerUpdate.js
// (prompt mode: the update banner in App asks before activating a new build).
if (!import.meta.env.PROD) {
  navigator.serviceWorker?.getRegistrations?.().then(registrations => {
    registrations.forEach(registration => registration.unregister());
  });
}
import './index.css'
import App from './App.jsx'
import { PredictionProvider } from './context/PredictionContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <PredictionProvider>
          <App />
        </PredictionProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
)
