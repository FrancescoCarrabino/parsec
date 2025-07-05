// parsec-frontend/src/App.tsx

import { useEffect } from 'react';
import { AppStateProvider, useAppState } from './state/AppStateContext';
import { Canvas } from './canvas/Canvas';
import { ChatInput } from './chat/ChatInput';
import { webSocketClient } from './api/websocket_client';
import { LayersPanel } from './layers/LayersPanel';
import { PropertiesPanel } from './properties/PropertiesPanel';
import { Toolbar } from './canvas/Toolbar';
import { ComponentsPanel } from './components/ComponentsPanel'; // NEW: Import the ComponentsPanel

const ParsecApp = () => {
  const { dispatch } = useAppState();

  useEffect(() => {
    webSocketClient.connect(dispatch);
  }, [dispatch]);

  const appLayoutStyle: React.CSSProperties = { display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: '#333639' };
  
  // NEW: A container for the left-side panels
  const leftPanelsContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    width: '260px', // Set a fixed width for the left column
    background: '#25282B',
  };
  
  const canvasContainerStyle: React.CSSProperties = { flex: 1, position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' };

  return (
    <div style={appLayoutStyle}>
      {/* NEW: Use the left panels container */}
      <div style={leftPanelsContainerStyle}>
        <LayersPanel />
        <ComponentsPanel /> {/* <-- ADD THE NEW PANEL HERE */}
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

function App() {
  return (
    <AppStateProvider>
      <ParsecApp />
    </AppStateProvider>
  );
}

export default App;