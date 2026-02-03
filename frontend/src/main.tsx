import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/modern-theme.css'
import './index.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'

console.log('Main.tsx executing');

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
