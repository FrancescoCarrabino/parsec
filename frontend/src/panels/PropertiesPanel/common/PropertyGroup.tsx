// src/panels/PropertiesPanel/common/PropertyGroup.tsx
import React, { useState } from 'react';

const groupStyle: React.CSSProperties = {
    borderBottom: '1px solid #3a3a3a',
    paddingBottom: '10px',
    marginBottom: '10px',
};

const titleStyle: React.CSSProperties = {
    color: '#aaa',
    fontSize: '11px',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: '8px',
    cursor: 'pointer',
};

export const PropertyGroup: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
    const [isOpen, setIsOpen] = useState(true);

    return (
        <div style={groupStyle}>
            <div style={titleStyle} onClick={() => setIsOpen(!isOpen)}>
                {title} {isOpen ? '▼' : '►'}
            </div>
            {isOpen && <div>{children}</div>}
        </div>
    );
};