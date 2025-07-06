// parsec-frontend/src/App.tsx

import React, { useEffect } from 'react';
import { useAppState } from './state/AppStateContext';
import { Canvas } from './canvas/Canvas';
import { ChatInput } from './chat/ChatInput';
import { webSocketClient } from './api/websocket_client';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { Toolbar } from './canvas/Toolbar';
import { ComponentsPanel } from './components/ComponentsPanel';
import { PresentationView } from './presentation/PresentationView';
import { LayersPanel } from './panels/LayersPanel';
import { nanoid } from 'nanoid'; // For generating unique IDs on paste
import type { CanvasElement } from './state/types';

// This will be our simple, in-memory clipboard, stored outside the component
// so it persists across re-renders without causing them.
let clipboard: CanvasElement[] = [];

// This is the main application component with all the layout and logic.
const ParsecApp = () => {
  const { state, dispatch } = useAppState();

  useEffect(() => {
    webSocketClient.connect(dispatch);
  }, [dispatch]);

  // --- NEW: Global Event Handler for Undo/Redo/Copy/Paste ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        // Ignore key presses if the user is typing in an input field.
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
            return;
        }

        const isUndo = (e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey;
        const isRedo = (e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey));
        const isCopy = (e.ctrlKey || e.metaKey) && e.key === 'c';
        const isPaste = (e.ctrlKey || e.metaKey) && e.key === 'v';

        if (isUndo) {
            e.preventDefault();
            console.log("Action: Undo");
            webSocketClient.sendUndo();
        } else if (isRedo) {
            e.preventDefault();
            console.log("Action: Redo");
            webSocketClient.sendRedo();
        } else if (isCopy) {
            e.preventDefault();
            if (state.selectedElementIds.length > 0) {
                // Deep copy the selected elements into our clipboard variable.
                clipboard = state.selectedElementIds
                    .map(id => state.elements[id])
                    .filter(Boolean) // Filter out any potentially undefined elements
                    .map(el => JSON.parse(JSON.stringify(el)));
                
                console.log(`${clipboard.length} elements copied to clipboard.`);
            }
        } else if (isPaste) {
            e.preventDefault();
            if (clipboard.length > 0) {
                const newElements = clipboard.map(el => {
                    // Create a new element object with a new ID and slightly offset position.
                    return {
                        ...el,
                        id: `${el.element_type}_${nanoid(8)}`, // Generate a new unique ID
                        x: el.x + 20,
                        y: el.y + 20,
                    };
                });
                webSocketClient.sendCreateElementsBatch(newElements);
                console.log(`Pasting ${newElements.length} elements.`);
            }
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
    };
    // Re-bind the listener if the selection changes, to ensure the copy command always has the latest selection.
  }, [state.selectedElementIds, state.elements]);


  // Conditional rendering for presentation mode is correct.
  if (state.presentation.isActive) {
    return <PresentationView />;
  }

  // The main workspace layout is correct.
  const appLayoutStyle: React.CSSProperties = { display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: '#333639' };
  const leftPanelsContainerStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', width: '260px', background: '#25282B', };
  const canvasContainerStyle: React.CSSProperties = { flex: 1, position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' };

  return (
    <div style={appLayoutStyle}>
      <div style={leftPanelsContainerStyle}>
        <LayersPanel />
        <ComponentsPanel />
      </div>
      <div style={canvasContainerStyle}>
        <Toolbar />
        <Canvas />
        <ChatInput />
      </div>
      <PropertiesPanel />
    </div>
  );
};


// This is the component that will be rendered by your main.tsx.
// It correctly assumes that AppStateProvider and DndProvider are wrapped
// around it in main.tsx, so it doesn't provide them again.
function App() {
  return (
    <ParsecApp />
  );
}

export default App;