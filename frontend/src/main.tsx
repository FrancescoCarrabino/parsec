// parsec-frontend/src/index.tsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App'; // Assuming your main app component is here
import { AppStateProvider } from './state/AppStateContext';
import { DndProvider } from 'react-dnd'; // <--- IMPORT
import { HTML5Backend } from 'react-dnd-html5-backend'; // <--- IMPORT

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppStateProvider>
      <DndProvider backend={HTML5Backend}> {/* <--- WRAP a DndProvider */}
        <App />
      </DndProvider>
    </AppStateProvider>
  </React.StrictMode>,
);
