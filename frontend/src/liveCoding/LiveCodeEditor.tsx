import React from 'react';
import Editor from '@monaco-editor/react';
import { useAppState } from '../state/AppStateContext';
import styles from './LiveCodeEditor.module.css'; // And this one

export const LiveCodeEditor = () => {
  const { state } = useAppState();
  const { analysisSession } = state;

  if (!analysisSession || !analysisSession.isActive) {
    return null;
  }

  return (
    <div className={styles.editorContainer}>
      <div className={styles.header}>AI Generated Code</div>
      <Editor
        height="100%"
        language="python"
        theme="vs-dark"
        value={analysisSession.currentCode}
        options={{
          readOnly: true, // User cannot edit the code directly
          domReadOnly: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 14,
        }}
      />
    </div>
  );
};