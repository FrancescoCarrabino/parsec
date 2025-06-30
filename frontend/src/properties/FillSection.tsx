import React from 'react';
import type { Fill, SolidFill, LinearGradientFill, ShapeElement, GradientStop } from '../state/types';

interface FillSectionProps {
  element: ShapeElement;
  onFillChange: (newFill: Fill) => void;
}

export const FillSection: React.FC<FillSectionProps> = ({ element, onFillChange }) => {
  const { fill } = element;

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value;
    if (newType === 'solid') {
      onFillChange({ type: 'solid', color: '#cccccc' });
    } else if (newType === 'linear-gradient') {
      onFillChange({
        type: 'linear-gradient',
        angle: 90,
        stops: [
          { color: '#ff0000', offset: 0 },
          { color: '#0000ff', offset: 1 }
        ]
      });
    }
  };

  const handleGradientStopChange = (index: number, newStop: Partial<GradientStop>) => {
    const gradientFill = fill as LinearGradientFill;
    const newStops = [...gradientFill.stops];
    newStops[index] = { ...newStops[index], ...newStop };
    onFillChange({ ...gradientFill, stops: newStops });
  };

  // --- Styles (self-contained) ---
  const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' };
  const labelStyle: React.CSSProperties = { color: '#aaa', fontSize: '12px' };
  const inputStyle: React.CSSProperties = { width: '100px', background: '#333', border: '1px solid #555', color: 'white', padding: '4px 8px', borderRadius: '4px', textAlign: 'right' };
  const selectStyle: React.CSSProperties = { ...inputStyle, textAlign: 'left', width: '100%' };

  const renderFillEditor = () => {
    switch (fill.type) {
      case 'solid':
        const solidFill = fill as SolidFill;
        return (
          <div style={rowStyle}>
            <label htmlFor="fill-color-picker" style={labelStyle}>Color</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="text"
                value={solidFill.color}
                onChange={(e) => onFillChange({ ...solidFill, color: e.target.value })}
                style={{ ...inputStyle, width: '70px', fontSize: '12px' }}
              />
              <input
                id="fill-color-picker"
                type="color"
                value={solidFill.color}
                onChange={(e) => onFillChange({ ...solidFill, color: e.target.value })}
                style={{ width: '24px', height: '24px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
              />
            </div>
          </div>
        );
      case 'linear-gradient':
        const gradientFill = fill as LinearGradientFill;
        return (
          <div style={{ marginTop: '12px' }}>
            <div style={rowStyle}>
              <label style={labelStyle}>Angle</label>
              <input
                type="number"
                value={gradientFill.angle}
                onChange={e => onFillChange({ ...gradientFill, angle: parseInt(e.target.value, 10) || 0 })}
                style={inputStyle}
              />
            </div>
            {gradientFill.stops.map((stop, index) => (
              <div key={index} style={{ borderTop: '1px solid #444', paddingTop: '8px', marginTop: '8px' }}>
                <div style={rowStyle}>
                  <label style={labelStyle}>Stop {index + 1} Color</label>
                  <input type="color" value={stop.color} onChange={e => handleGradientStopChange(index, { color: e.target.value })}
                    style={{ width: '24px', height: '24px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }} />
                </div>
                <div style={rowStyle}>
                  <label style={labelStyle}>Stop {index + 1} Position</label>
                  <input type="range" min="0" max="1" step="0.01" value={stop.offset}
                    onChange={e => handleGradientStopChange(index, { offset: parseFloat(e.target.value) })}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div>
      <div style={rowStyle}>
        <label style={labelStyle}>Type</label>
        <select value={fill.type} onChange={handleTypeChange} style={selectStyle}>
          <option value="solid">Solid</option>
          <option value="linear-gradient">Linear Gradient</option>
        </select>
      </div>
      {renderFillEditor()}
    </div>
  );
};
