// parsec-frontend/src/properties/CommonControls.tsx
import React from 'react';

// A styled container for a group of related properties.
export const PropertyGroup: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: '20px', borderTop: '1px solid #444', paddingTop: '16px' }}>
    <div style={{ color: 'white', fontWeight: 'bold', marginBottom: '10px', fontSize: '16px' }}>{title}</div>
    {children}
  </div>
);

// A flex-row container for a label and its input.
export const PropertyRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>{children}</div>
);

// A standard label for a property.
export const PropertyLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label style={{ color: '#aaa', fontSize: '12px', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>{children}</label>
);

// A standard text/number input.
export const StringInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input {...props} style={{ flex: 1, background: '#333', border: '1px solid #555', color: 'white', padding: '4px 8px', borderRadius: '4px', textAlign: 'right', marginLeft: '16px' }} />
);

// A standard color input.
export const ColorInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input {...props} type="color" style={{ background: 'transparent', border: 'none', width: '40px', height: '24px', marginLeft: '16px', cursor: 'pointer' }} />
);