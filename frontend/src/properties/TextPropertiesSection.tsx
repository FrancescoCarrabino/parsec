// parsec-frontend/src/properties/TextPropertiesSection.tsx

import React from 'react';
import type { TextElement } from '../state/types';

interface TextPropertiesSectionProps {
  element: TextElement;
  onPropertyChange: (property: string, value: any) => void;
}

// --- CONFIGURATION ---
// This is where we define the fonts and weights available to the user.
// The `fontFamily` must match the CSS name (from @fontsource).
// The `weights` must match the weights we imported in index.tsx.
const FONT_OPTIONS = [
  { fontFamily: 'Inter', weights: [400, 700] },
  { fontFamily: 'Roboto', weights: [400, 700] },
  { fontFamily: 'Lato', weights: [400, 700] },
  { fontFamily: 'Montserrat', weights: [400, 600, 700] },
  { fontFamily: 'Playfair Display', weights: [400, 700] },
  { fontFamily: 'Source Code Pro', weights: [400, 600] },
];

const WEIGHT_MAP: { [key: number]: string } = {
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semi-Bold',
  700: 'Bold',
  800: 'Extra-Bold',
  900: 'Black',
};

// --- STYLES ---
const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' };
const labelStyle: React.CSSProperties = { color: '#aaa', fontSize: '12px' };
const inputStyle: React.CSSProperties = { width: '70px', background: '#333', border: '1px solid #555', color: 'white', padding: '4px 8px', borderRadius: '4px', textAlign: 'right' };
const selectStyle: React.CSSProperties = { width: '100%', background: '#333', border: '1px solid #555', color: 'white', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' };
const alignButtonGroupStyle: React.CSSProperties = { display: 'flex', width: '100%' };
const alignButtonStyle: React.CSSProperties = { flex: 1, background: '#333', border: '1px solid #555', color: '#ccc', padding: '4px', cursor: 'pointer' };
const activeAlignButtonStyle: React.CSSProperties = { ...alignButtonStyle, background: '#007aff', color: 'white' };

export const TextPropertiesSection: React.FC<TextPropertiesSectionProps> = ({ element, onPropertyChange }) => {

  const handleFontFamilyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newFontFamily = e.target.value;
    const font = FONT_OPTIONS.find(f => f.fontFamily === newFontFamily);
    // When changing family, check if the current weight is available.
    // If not, fall back to the first available weight (usually 400).
    const newWeight = font && font.weights.includes(element.fontWeight) ? element.fontWeight : font?.weights[0] || 400;
    
    onPropertyChange('fontFamily', newFontFamily);
    onPropertyChange('fontWeight', newWeight);
  };
  
  const availableWeights = FONT_OPTIONS.find(f => f.fontFamily === element.fontFamily)?.weights || [400];

  return (
    <div>
      {/* Font Family Dropdown */}
      <div style={rowStyle}>
        <label style={labelStyle}>Font</label>
        <select value={element.fontFamily} onChange={handleFontFamilyChange} style={{...selectStyle, flex: 1, marginLeft: '16px' }}>
          {FONT_OPTIONS.map(font => (
            <option key={font.fontFamily} value={font.fontFamily} style={{ fontFamily: font.fontFamily, fontSize: '16px' }}>
              {font.fontFamily}
            </option>
          ))}
        </select>
      </div>

      {/* Font Weight Dropdown */}
      <div style={rowStyle}>
        <label style={labelStyle}>Weight</label>
        <select value={element.fontWeight} onChange={e => onPropertyChange('fontWeight', parseInt(e.target.value))} style={{...selectStyle, flex: 1, marginLeft: '16px' }}>
          {availableWeights.map(weight => (
            <option key={weight} value={weight}>
              {WEIGHT_MAP[weight] || weight}
            </option>
          ))}
        </select>
      </div>

      {/* Font Size, Color, etc. */}
      <div style={rowStyle}>
        <label style={labelStyle}>Size</label>
        <input type="number" value={element.fontSize} onChange={e => onPropertyChange('fontSize', parseInt(e.target.value) || 12)} style={inputStyle} />
      </div>
      <div style={rowStyle}>
        <label style={labelStyle}>Color</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="text" value={element.fontColor} onChange={e => onPropertyChange('fontColor', e.target.value)} style={{ ...inputStyle, width: '70px', fontSize: '12px' }} />
            <input type="color" value={element.fontColor} onChange={e => onPropertyChange('fontColor', e.target.value)} style={{ width: '24px', height: '24px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }} />
          </div>
      </div>

      {/* Spacing Properties */}
      <div style={rowStyle}>
        <label style={labelStyle}>Line Height</label>
        <input type="number" step="0.1" value={element.lineHeight} onChange={e => onPropertyChange('lineHeight', parseFloat(e.target.value) || 1.2)} style={inputStyle} />
      </div>
      <div style={rowStyle}>
        <label style={labelStyle}>Letter Spacing</label>
        <input type="number" value={element.letterSpacing} onChange={e => onPropertyChange('letterSpacing', parseFloat(e.target.value) || 0)} style={inputStyle} />
      </div>
      
      {/* Alignment Buttons */}
      <div style={rowStyle}>
        <label style={labelStyle}>Align</label>
        <div style={{...alignButtonGroupStyle, marginLeft: '16px', width: '120px'}}>
            <button onClick={() => onPropertyChange('align', 'left')} style={element.align === 'left' ? activeAlignButtonStyle : alignButtonStyle}>L</button>
            <button onClick={() => onPropertyChange('align', 'center')} style={element.align === 'center' ? activeAlignButtonStyle : alignButtonStyle}>C</button>
            <button onClick={() => onPropertyChange('align', 'right')} style={element.align === 'right' ? activeAlignButtonStyle : alignButtonStyle}>R</button>
        </div>
      </div>
    </div>
  );
};