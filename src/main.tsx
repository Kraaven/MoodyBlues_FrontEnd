import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/space-grotesk/wght.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles/tokens.css';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { queryClient } from './api/queries';
import { ToastProvider } from './ui/Toast';
import { TooltipProvider } from './ui/Tooltip';

// `?motion=reduce` forces reduced motion, for checking it without changing the OS setting.
if (new URLSearchParams(window.location.search).get('motion') === 'reduce') document.documentElement.classList.add('reduce-motion');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
