// parsec-frontend/src/properties/TextSection.tsx

import React from 'react';
import type { TextElement } from '../state/types';

interface TextSectionProps {
  element: TextElement;
  onPropertyChange: (property: string, value: any) => void;
}

// --- Reusable Styles (can be moved to a shared file later) ---
const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' };
const labelStyle: React.CSSProperties = { color: '#aaa', fontSize: '12px' };
const inputStyle: React.CSSProperties = { width: '100px', background: '#333', border: '1px solid #555', color: 'white', padding: '4px 8px', borderRadius: '4px', textAlign: 'right' };
const selectStyle: React.CSSProperties = { ...inputStyle, textAlign: 'left', width: '100%' };

export const TextSection: React.FC<TextSectionProps> = ({ element, onPropertyChange }) => {

  return (
    <div>
      <div style={rowStyle}>
        <label style={labelStyle}>Font Family</label>
        <input
          type="text"
          value={element.fontFamily}
          onChange={(e) => onPropertyChange('fontFamily', e.target.value)}
          style={inputStyle}
        />
      </div>
      <div style={rowStyle}>
        <label style={labelStyle}>Font Size</label>
        <input
          type="number"
          value={element.fontSize}
          onChange={(e) => onPropertyChange('fontSize', parseInt(e.target.value, 10) || 12)}
          style={inputStyle}
        />
      </div>
      <div style={rowStyle}>
        <label htmlFor="font-color-picker" style={labelStyle}>Font Color</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="text"
            value={element.fontColor}
            onChange={(e) => onPropertyChange('fontColor', e.target.value)}
            style={{ ...inputStyle, width: '70px', fontSize: '12px' }}
          />
          <input
            id="font-color-picker"
            type="color"
            value={element.fontColor}
            onChange={(e) => onPropertyChange('fontColor', e.target.value)}
            style={{ width: '24px', height: '24px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
          />
        </div>
      </div>
      <div style={rowStyle}>
        <label style={labelStyle}>Align</label>
        <select
          value={element.align}
          onChange={(e) => onPropertyChange('align', e.target.value)}
          style={selectStyle}
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </div>
      <div style={rowStyle}>
        <label style={labelStyle}>Vertical Align</label>
        <select
          value={element.verticalAlign}
          onChange={(e) => onPropertyChange('verticalAlign', e.target.value)}
          style={selectStyle}
        >
          <option value="top">Top</option>
          <option value="middle">Middle</option>
          <option value="bottom">Bottom</option>
        </select>
      </div>
    </div>
  );
};
