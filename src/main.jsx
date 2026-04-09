import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'

// Reload the page whenever a new service worker takes control so users
// always get the latest version instead of a stale cached build.
registerSW({
  onRegisteredSW() {},
  onNeedRefresh() {},
  // autoUpdate mode: the SW calls skipWaiting automatically; reload when it claims the client
  immediate: true,
});

// Hard reload once when a new SW takes control of this page
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  window.location.reload();
});
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
