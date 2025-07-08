import React from 'react';
import { useAppState } from './state/AppStateContext';
import { Canvas } from './canvas/Canvas';
import { ChatInput } from './chat/ChatInput';
import { webSocketClient } from './api/websocket_client';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { Toolbar } from './canvas/Toolbar';
import { ComponentsPanel } from './panels/ComponentsPanel';
import { LayersPanel } from './panels/LayersPanel';
import { PresentationView } from './presentation/PresentationView';
import { useGlobalHotkeys } from './hooks/useGlobalHotkeys';
import { AgentStatusIndicator } from './chat/AgentStatusIndicator';
import styles from './App.module.css';

const ParsecApp = () => {
  // 1. Get the global state from our context hook.
  const { state, dispatch } = useAppState();

  React.useEffect(() => {
    webSocketClient.connect(dispatch);
  }, [dispatch]);

  useGlobalHotkeys();

  // 2. DERIVE the 'isAgentActive' flag on every single render.
  //    This is the "source of truth" for what the UI should show.
  const isAgentActive = state.agentStatus !== null;

  if (state.presentation.isActive) {
    return <PresentationView />;
  }

  return (
    <div className={styles.appLayout}>
      <aside className={styles.leftColumn}>
        <LayersPanel />
        <ComponentsPanel />
      </aside>

      <main className={styles.mainContent}>
        <Toolbar />
        <Canvas />
        
        {/*
          3. USE the derived flag in a ternary operator to decide which component to render.
             - If isAgentActive is true, show the status indicator.
             - If isAgentActive is false, show the chat input.
        */}
        {isAgentActive ? <AgentStatusIndicator /> : <ChatInput />}
      </main>
      
      
      <aside className={styles.rightColumn}>
        <PropertiesPanel />
      </aside>
    </div>
  );
};

function App() {
  return <ParsecApp />;
}

export default App;