// src/App.tsx
import React from 'react';
import { useAppState } from './state/AppStateContext';
import { Canvas } from './canvas/Canvas';
import { ChatInput } from './chat/ChatInput';
import { webSocketClient } from './api/websocket_client';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { Toolbar } from './canvas/Toolbar';
import { LayersPanel } from './panels/LayersPanel';
import { ComponentsPanel } from './panels/ComponentsPanel';
import { AssetsPanel } from './panels/AssetsPanel'; // <-- 1. IMPORT THE NEW PANEL
import { PresentationView } from './presentation/PresentationView';
import { useGlobalHotkeys } from './hooks/useGlobalHotkeys';
import { AgentStatusIndicator } from './chat/AgentStatusIndicator';
import { ChatPanel } from './chat/ChatPanel';
import { LiveCodeEditor } from './liveCoding/LiveCodeEditor';
import styles from './App.module.css';

const ParsecApp = () => {
  const { state, dispatch } = useAppState();

  React.useEffect(() => {
    webSocketClient.connect(dispatch);
  }, [dispatch]);

  useGlobalHotkeys();

  const isAgentActive = state.agentStatus !== null;
  const isAnalysisActive = state.analysisSession?.isActive === true;

  if (state.presentation.isActive) {
    return <PresentationView />;
  }

  return (
    <div className={styles.appLayout}>
      {/* LEFT COLUMN: Contains all the source panels */}
      <aside className={styles.leftColumn}>
        <LayersPanel />
        <ComponentsPanel />
        <AssetsPanel /> {/* <-- 2. ADD THE PANEL TO THE LAYOUT HERE */}
      </aside>

      {/* MAIN CANVAS AREA */}
      <main className={styles.mainContent}>
        <Toolbar />
        <Canvas />
        {isAnalysisActive ? (
          <>
            <LiveCodeEditor />
            <ChatPanel />
          </>
        ) : isAgentActive ? (
          <AgentStatusIndicator />
        ) : (
          <ChatInput />
        )}
      </main>
      
      {/* RIGHT COLUMN: Contains the inspector */}
      <aside className={styles.rightColumn}>
        <PropertiesPanel />
      </aside>
    </div>
  );
};

function App() {
  // Assuming you have an AppStateProvider wrapping your app in main.tsx
  return <ParsecApp />;
}

export default App;