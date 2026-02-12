
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './src/theme';

// Tema activo - cambiar para diferentes juegos/ambientaciones
const ACTIVE_THEME = 'forest';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error("Could not find root element to mount to");

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ThemeProvider theme={ACTIVE_THEME}>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
