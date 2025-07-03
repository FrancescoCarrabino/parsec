// parsec-frontend/src/index.tsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App'; // Assuming your main app component is here
import { AppStateProvider } from './state/AppStateContext';
import { DndProvider } from 'react-dnd'; // <--- IMPORT
import { HTML5Backend } from 'react-dnd-html5-backend'; // <--- IMPORT

import '@fontsource/inter/400.css';      // Regular
import '@fontsource/inter/700.css';      // Bold
import '@fontsource/roboto/400.css';     // Regular
import '@fontsource/roboto/700.css';     // Bold
import '@fontsource/lato/400.css';       // Regular
import '@fontsource/lato/700.css';       // Bold
import '@fontsource/montserrat/400.css'; // Regular
import '@fontsource/montserrat/600.css'; // Semi-Bold
import '@fontsource/montserrat/700.css'; // Bold

// Serif font (for display/headings)
import '@fontsource/playfair-display/400.css'; // Regular
import '@fontsource/playfair-display/700.css'; // Bold

// Monospace font (for code or technical text)
import '@fontsource/source-code-pro/400.css'; // Regular
import '@fontsource/source-code-pro/600.css'; // Semi-Bold

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppStateProvider>
      <DndProvider backend={HTML5Backend}> {/* <--- WRAP a DndProvider */}
        <App />
      </DndProvider>
    </AppStateProvider>
  </React.StrictMode>,
);
