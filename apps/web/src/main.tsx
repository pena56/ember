import '@fontsource/fraunces';
import '@fontsource/inter';
import './styles.css';

import { ConvexAuthProvider } from '@convex-dev/auth/react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import App from './App.js';
import { convex } from './convex/convex-client.js';
import { StoreProvider } from './store/store-context.js';
import { ThemeProvider } from './theme/theme-provider.js';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ConvexAuthProvider client={convex}>
      <ThemeProvider>
        <StoreProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </StoreProvider>
      </ThemeProvider>
    </ConvexAuthProvider>
  </React.StrictMode>,
);
