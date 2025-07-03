// parsec-frontend/src/properties/PropertiesPanel.tsx

import React from 'react';
import { useAppState } from '../state/AppStateContext';
import { webSocketClient } from '../api/websocket_client';
import type { ShapeElement, TextElement, FrameElement, PathElement, Fill, CanvasElement } from '../state/types';
import { FillSection } from './FillSection';
import { TextSection } from './TextSection';

// --- STYLES (no changes) ---
const panelStyle: React.CSSProperties = { width: '280px', height: '100%', background: '#252627', color: '#ccc', padding: '16px', boxSizing: 'border-box', fontFamily: 'sans-serif', fontSize: '14px', zIndex: 10, borderLeft: '1px solid #444', overflowY: 'auto' };
const sectionStyle: React.CSSProperties = { marginBottom: '20px', borderTop: '1px solid #444', paddingTop: '16px' };
const titleStyle: React.CSSProperties = { color: 'white', fontWeight: 'bold', marginBottom: '10px', fontSize: '16px' };
const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' };
const labelStyle: React.CSSProperties = { color: '#aaa', fontSize: '12px', whiteSpace: 'nowrap' };
const inputStyle: React.CSSProperties = { flex: 1, background: '#333', border: '1px solid #555', color: 'white', padding: '4px 8px', borderRadius: '4px', textAlign: 'right', marginLeft: '16px' };
const buttonStyle: React.CSSProperties = { background: '#3a3d40', border: '1px solid #555', color: '#ccc', padding: '8px', borderRadius: '4px', cursor: 'pointer', width: '100%' };
const arrangeButtonStyle: React.CSSProperties = { ...buttonStyle, padding: '4px' };
const disabledButtonStyle: React.CSSProperties = { ...buttonStyle, cursor: 'not-allowed', opacity: 0.4 };

const PropertyInput = ({ label, propName, type = 'number', element, onUpdate }: { label: string; propName: string; type?: string; element: CanvasElement; onUpdate: (prop: string, val: any) => void; }) => {
  const value = element[propName as keyof typeof element] ?? (type === 'number' ? 0 : '');
  return (<div style={rowStyle}><label style={labelStyle}>{label}</label><input type={type} value={String(value)} onChange={(e) => onUpdate(propName, type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)} style={inputStyle} /></div>);
};

export const PropertiesPanel: React.FC = () => {
  const { state } = useAppState();
  const { elements, selectedElementIds } = state;
  const selectedElement = selectedElementIds.length === 1 ? elements[selectedElementIds[0]] : null;

  const handlePropertyChange = (property: string, value: any) => { if (!selectedElement) return; webSocketClient.sendElementUpdate({ id: selectedElement.id, [property]: value }); };
  
  // --- FIX: Correctly call sendReorderElement ---
  const handleArrange = (command: string) => { 
    if (!selectedElement) return; 
    // This now calls the correct method from our fixed websocket_client.ts
    webSocketClient.sendReorderElement(selectedElement.id, command); 
  };
  
  const handleGroup = () => { if (selectedElementIds.length > 1) { webSocketClient.sendGroupElements(selectedElementIds); } };
  const handleUngroup = () => { if (selectedElement && (selectedElement.element_type === 'group' || selectedElement.element_type === 'frame')) { webSocketClient.sendUngroupElement(selectedElement.id); } };

  if (!selectedElement) {
    const canGroup = selectedElementIds.length > 1;
    return (<div style={panelStyle}><div style={titleStyle}>Properties</div><p style={{ color: '#888', textAlign: 'center', marginTop: '40px' }}>{selectedElementIds.length > 1 ? `${selectedElementIds.length} elements selected` : 'No element selected.'}</p><div style={sectionStyle}><div style={titleStyle}>Grouping</div><button onClick={handleGroup} style={canGroup ? buttonStyle : disabledButtonStyle} disabled={!canGroup}>Group Selection (Ctrl+G)</button></div></div>);
  }

  // --- REFACTOR: Simplify element type casting ---
  const shapeElement = selectedElement.element_type === 'shape' ? selectedElement as ShapeElement : null;
  const textElement = selectedElement.element_type === 'text' ? selectedElement as TextElement : null;
  const frameElement = selectedElement.element_type === 'frame' ? selectedElement as FrameElement : null;
  const pathElement = selectedElement.element_type === 'path' ? selectedElement as PathElement : null;
  const groupElement = selectedElement.element_type === 'group' ? selectedElement : null;

  const canUngroup = !!(frameElement || groupElement);
  // This variable will hold whichever element type is currently selected that can have a fill/stroke.
  const fillableElement = shapeElement || frameElement || pathElement;
  // This variable will hold whichever element type can have corner radius.
  const cornerElement = shapeElement || frameElement;

  return (
    <div style={panelStyle}>
      <div style={{ ...titleStyle, paddingBottom: '8px' }}>{selectedElement.name || selectedElement.element_type}</div>
      <div style={{ ...sectionStyle, borderTop: 'none', paddingTop: '0' }}><div style={titleStyle}>Grouping</div><button onClick={handleUngroup} style={canUngroup ? buttonStyle : disabledButtonStyle} disabled={!canUngroup}>Ungroup (Ctrl+Shift+G)</button></div>
      <div style={sectionStyle}><div style={titleStyle}>Transform</div><PropertyInput label="Name" propName="name" type="text" element={selectedElement} onUpdate={handlePropertyChange} /><PropertyInput label="X" propName="x" element={selectedElement} onUpdate={handlePropertyChange} /><PropertyInput label="Y" propName="y" element={selectedElement} onUpdate={handlePropertyChange} /><PropertyInput label="Width" propName="width" element={selectedElement} onUpdate={handlePropertyChange} /><PropertyInput label="Height" propName="height" element={selectedElement} onUpdate={handlePropertyChange} /><PropertyInput label="Rotation" propName="rotation" element={selectedElement} onUpdate={handlePropertyChange} /></div>
      
      {textElement && <div style={sectionStyle}><div style={titleStyle}>Text</div><TextSection element={textElement} onPropertyChange={handlePropertyChange} /></div>}
      
      {fillableElement && (
        <>
          <div style={sectionStyle}>
            <div style={titleStyle}>Fill</div>
            {/* --- FIX: Pass the `fill` prop directly and correctly handle `null` --- */}
            <FillSection 
              fill={fillableElement.fill}
              onFillChange={(newFill: Fill | null) => handlePropertyChange('fill', newFill)}
            />
          </div>
          <div style={sectionStyle}>
            <div style={titleStyle}>Stroke</div>
            {fillableElement.stroke ? 
              <button onClick={() => handlePropertyChange('stroke', null)} style={{ ...buttonStyle, marginBottom: '8px' }}>Remove Stroke</button> : 
              <button onClick={() => handlePropertyChange('stroke', { type: 'solid', color: '#888888' })} style={{...buttonStyle, marginBottom: '8px'}}>Add Stroke</button>
            }
            {fillableElement.stroke && (<>
              <PropertyInput label="Width" propName="strokeWidth" element={selectedElement} onUpdate={handlePropertyChange} />
              {/* --- FIX: Pass the `stroke` prop directly --- */}
              <FillSection 
                fill={fillableElement.stroke} 
                onFillChange={(newStrokeFill: Fill | null) => handlePropertyChange('stroke', newStrokeFill)} 
              />
            </>)}
          </div>
        </>
      )}

      {cornerElement && <div style={sectionStyle}><div style={titleStyle}>Corners</div><PropertyInput label="Radius" propName="cornerRadius" element={selectedElement} onUpdate={handlePropertyChange} /></div>}
      
      {frameElement && <div style={sectionStyle}><div style={titleStyle}>Frame</div><div style={rowStyle}><label style={labelStyle}>Clip content</label><input type="checkbox" checked={frameElement.clipsContent} onChange={(e) => handlePropertyChange('clipsContent', e.target.checked)} style={{ width: '20px', height: '20px' }} /></div></div>}
      
      <div style={sectionStyle}>
        <div style={titleStyle}>Arrange</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {/* Pass the correct command strings the backend expects */}
          <button onClick={() => handleArrange('BRING_FORWARD')} style={arrangeButtonStyle}>Forward</button>
          <button onClick={() => handleArrange('SEND_BACKWARD')} style={arrangeButtonStyle}>Backward</button>
          <button onClick={() => handleArrange('BRING_TO_FRONT')} style={arrangeButtonStyle}>To Front</button>
          <button onClick={() => handleArrange('SEND_TO_BACK')} style={arrangeButtonStyle}>To Back</button>
        </div>
      </div>
    </div>
  );
};