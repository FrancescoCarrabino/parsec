import React, { useState, useEffect, useRef } from 'react';
import { useAppState } from '../state/AppStateContext';
import { webSocketClient } from '../api/websocket_client';
import styles from './ChatPanel.module.css'; // We will create this file next

export const ChatPanel = () => {
  const { state } = useAppState();
  const { analysisSession } = state;
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to the latest message
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [analysisSession?.messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && analysisSession) {
      // We need a new method in our WebSocket client for this
      webSocketClient.sendAnalysisMessage(analysisSession.sessionId, input);
      setInput('');
    }
  };

  if (!analysisSession || !analysisSession.isActive) {
    return null;
  }

  return (
    <div className={styles.chatPanel}>
      <div className={styles.messagesContainer}>
        {analysisSession.messages.map((msg) => (
          <div key={msg.id} className={`${styles.message} ${styles[msg.sender]}`}>
            <p>{msg.text}</p>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSendMessage} className={styles.inputForm}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Give your feedback to the AI..."
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
};