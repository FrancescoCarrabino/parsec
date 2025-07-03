// parsec-frontend/src/properties/FillSection.tsx
import React from 'react';
import type { Fill, SolidFill, LinearGradientFill, GradientStop } from '../state/types';

interface FillSectionProps {
  fill: Fill | null | undefined; // Now accepts null/undefined
  onFillChange: (newFill: Fill | null) => void; // Can send null back
}

export const FillSection: React.FC<FillSectionProps> = ({ fill, onFillChange }) => {
  const handleToggleFill = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      onFillChange({ type: 'solid', color: '#cccccc' }); // Add a default fill
    } else {
      onFillChange(null); // Remove the fill
    }
  };

  if (!fill) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input type="checkbox" checked={false} onChange={handleToggleFill} />
        <label style={{ color: '#aaa', fontSize: '12px' }}>Enable Fill</label>
      </div>
    );
  }

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
    if (fill.type !== 'linear-gradient') return;
    const newStops = [...fill.stops];
    newStops[index] = { ...newStops[index], ...newStop };
    onFillChange({ ...fill, stops: newStops });
  };

  const styles = {
    row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
    label: { color: '#aaa', fontSize: '12px' },
    input: { width: '100px', background: '#333', border: '1px solid #555', color: 'white', padding: '4px 8px', borderRadius: '4px', textAlign: 'right' },
    select: { width: '100%', background: '#333', border: '1px solid #555', color: 'white', padding: '4px 8px', borderRadius: '4px', textAlign: 'left' },
  };

  return (
    <div>
      <div style={styles.row}>
        <label style={styles.label}>Type</label>
        <select value={fill.type} onChange={handleTypeChange} style={styles.select}>
          <option value="solid">Solid</option>
          <option value="linear-gradient">Linear Gradient</option>
        </select>
      </div>
      {fill.type === 'solid' && (
        <div style={styles.row}>
          <label htmlFor="fill-color-picker" style={styles.label}>Color</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="text" value={fill.color} onChange={(e) => onFillChange({ ...fill, color: e.target.value })} style={{ ...styles.input, width: '70px', fontSize: '12px' }} />
            <input id="fill-color-picker" type="color" value={fill.color} onChange={(e) => onFillChange({ ...fill, color: e.target.value })} style={{ width: '24px', height: '24px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }} />
          </div>
        </div>
      )}
      {fill.type === 'linear-gradient' && (
        <div style={{ marginTop: '12px' }}>
          <div style={styles.row}>
            <label style={styles.label}>Angle</label>
            <input type="number" value={fill.angle} onChange={e => onFillChange({ ...fill, angle: parseInt(e.target.value, 10) || 0 })} style={styles.input} />
          </div>
          {fill.stops.map((stop, index) => (
            <div key={index} style={{ borderTop: '1px solid #444', paddingTop: '8px', marginTop: '8px' }}>
              <div style={styles.row}><label style={styles.label}>Stop {index + 1} Color</label><input type="color" value={stop.color} onChange={e => handleGradientStopChange(index, { color: e.target.value })} style={{ width: '24px', height: '24px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }} /></div>
              <div style={styles.row}><label style={styles.label}>Stop {index + 1} Position</label><input type="range" min="0" max="1" step="0.01" value={stop.offset} onChange={e => handleGradientStopChange(index, { offset: parseFloat(e.target.value) })} style={{ width: '100%' }} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
