// src/panels/PropertiesPanel/common/CommonControls.tsx
import React from 'react';

export const PropertyRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', marginBottom: '6px' }}>
        {children}
    </div>
);

export const PropertyLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <label style={{ color: '#ccc', fontSize: '12px' }}>{children}</label>
);

export const StringInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
    <input {...props} style={{
        width: '100%',
        background: '#1e1e1e',
        color: '#ccc',
        border: '1px solid #444',
        borderRadius: '4px',
        padding: '6px',
        boxSizing: 'border-box',
        fontSize: '12px'
    }} />
);

export const ActionButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = (props) => (
    <button {...props} style={{
        background: '#3f3f46',
        border: '1px solid #555',
        color: '#ccc',
        padding: '8px',
        borderRadius: '4px',
        cursor: 'pointer',
        width: '100%',
        textAlign: 'center',
        ...props.style,
    }} />
);