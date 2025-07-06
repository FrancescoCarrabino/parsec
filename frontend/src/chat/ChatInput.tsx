import React, { useState } from 'react';
import { webSocketClient } from '../api/websocket_client';
import { useAppState } from '../state/AppStateContext';
import styles from './ChatInput.module.css'; // Import the CSS module

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

  return (
    <div className={styles.chatContainer}>
      <form onSubmit={handleSubmit} className={styles.chatForm}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Parsec to design..."
          className={styles.inputField}
          autoFocus // Optionally autofocus on mount
        />
      </form>
    </div>
  );
};