import React, { useState } from 'react';
import { webSocketClient } from '../api/websocket_client';
import { useAppState } from '../state/AppStateContext';
import styles from './ChatInput.module.css';

export const ChatInput = () => {
  const [input, setInput] = useState('');
  const { state } = useAppState();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      webSocketClient.sendPrompt(input, state.selectedElementIds);
      setInput('');
    }
  };

  // --- REMOVED THE CONDITIONAL RETURN NULL ---
  // The parent component (App.tsx) now handles this.

  return (
<div className={`${styles.chatContainer} ${styles.fadeIn}`}>
        <form onSubmit={handleSubmit} className={styles.chatForm}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Parsec to design..."
          className={styles.inputField}
        />
      </form>
    </div>
  );
};