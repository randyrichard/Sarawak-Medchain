import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import { ErrorBoundary } from './app/ErrorBoundary'
import './styles/index.css'

declare global {
  interface Window { __safeopsUnsupported?: boolean }
}

// public/compat.js has already put an explanation in #root when the browser is below the
// floor; starting the app over it would only replace that with a half-working page.
if (!window.__safeopsUnsupported) {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  )
}
