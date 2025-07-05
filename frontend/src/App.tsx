// parsec-frontend/src/App.tsx

import { useEffect } from 'react';
import { useAppState } from './state/AppStateContext';
import { Canvas } from './canvas/Canvas';
import { ChatInput } from './chat/ChatInput';
import { webSocketClient } from './api/websocket_client';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { Toolbar } from './canvas/Toolbar';
import { ComponentsPanel } from './components/ComponentsPanel';
import { PresentationView } from './presentation/PresentationView';
import { LayersPanel } from './panels/LayersPanel'; // Correct import path

// This is the main application component with all the layout and logic.
const ParsecApp = () => {
  const { state, dispatch } = useAppState();

  useEffect(() => {
    webSocketClient.connect(dispatch);
  }, [dispatch]);

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