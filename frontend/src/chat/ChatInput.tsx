import React, { useState } from 'react';
import { webSocketClient } from '../api/websocket_client';
import { useAppState } from '../state/AppStateContext';

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

  const chatStyle: React.CSSProperties = { position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', width: 'clamp(300px, 60vw, 700px)', background: 'rgba(255, 255, 255, 0.1)', padding: '10px', borderRadius: '12px', boxShadow: '0 4px 30px rgba(0, 0, 0, 0.2)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)', border: '1px solid rgba(255, 255, 255, 0.2)', zIndex: 10, };
  const inputStyle: React.CSSProperties = { width: '100%', border: 'none', background: 'transparent', padding: '12px', boxSizing: 'border-box', fontSize: '16px', color: 'white', outline: 'none', };

  return (
    <div style={chatStyle}>
      <form onSubmit={handleSubmit}><input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask Parsec to design..." style={inputStyle} /></form>
    </div>
  );
};
