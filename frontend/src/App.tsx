import React from 'react';
import { useAppState } from './state/AppStateContext';
import { Canvas } from './canvas/Canvas';
import { ChatInput } from './chat/ChatInput';
import { webSocketClient } from './api/websocket_client';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { Toolbar } from './canvas/Toolbar'; // Updated to use lucide-react and CSS modules
import { ComponentsPanel } from './panels/ComponentsPanel'; // Corrected path
import { LayersPanel } from './panels/LayersPanel';
import { PresentationView } from './presentation/PresentationView';
import { useGlobalHotkeys } from './hooks/useGlobalHotkeys';
import styles from './App.module.css'; // Import the layout CSS module

// This is the main application component with all the layout and logic.
const ParsecApp = () => {
  const { state, dispatch } = useAppState();

  // Connect to WebSocket on mount
  React.useEffect(() => {
    webSocketClient.connect(dispatch);
  }, [dispatch]);

  // Use the clean, dedicated hook for global shortcuts
  useGlobalHotkeys();

  // Conditional rendering for presentation mode is correct.
  if (state.presentation.isActive) {
    return <PresentationView />;
  }

  // The main workspace layout using CSS Modules
  return (
    <div className={styles.appLayout}>
      <aside className={styles.leftColumn}>
        <LayersPanel />
        <ComponentsPanel />
      </aside>

      <main className={styles.mainContent}>
        {/* Add wrapper divs with classNames for precise positioning */}
        <div className="toolbar-wrapper"> {/* Use a class name */}
          <Toolbar />
        </div>
        <Canvas />
        <div className="chat-wrapper"> {/* Use a class name */}
          <ChatInput />
        </div>
      </main>
      
      <aside className={styles.rightColumn}>
        <PropertiesPanel />
      </aside>
    </div>
  );
};

// This is the component that will be rendered by your main.tsx.
function App() {
  return <ParsecApp />;
}

export default App;