import { useEffect } from 'react';
import { AppStateProvider, useAppState } from './state/AppStateContext';
import { Canvas } from './canvas/Canvas';
import { ChatInput } from './chat/ChatInput';
import { webSocketClient } from './api/websocket_client';
import { LayersPanel } from './layers/LayersPanel';
import { PropertiesPanel } from './properties/PropertiesPanel';
import { Toolbar } from './canvas/Toolbar'; // <-- IMPORT

const ParsecApp = () => {
  const { dispatch } = useAppState();

  useEffect(() => {
    webSocketClient.connect(dispatch);
  }, [dispatch]);

  const appLayoutStyle: React.CSSProperties = { display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: '#333639' };
  const canvasContainerStyle: React.CSSProperties = { flex: 1, position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' };

  return (
    <div style={appLayoutStyle}>
      <LayersPanel />
      <div style={canvasContainerStyle}>
        <Toolbar /> {/* <-- ADD TOOLBAR */}
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
