import React, { useState, useEffect } from 'react';
import { useAppState } from '../state/AppStateContext';
import { webSocketClient } from '../api/websocket_client';
import type { ShapeElement, TextElement, FrameElement, Fill, CanvasElement } from '../state/types';
import { FillSection } from './FillSection';
import { TextSection } from './TextSection';

// --- STYLES (Moved to top level for accessibility by all components in this file) ---
const panelStyle: React.CSSProperties = { width: '280px', height: '100%', background: '#252627', color: '#ccc', padding: '16px', boxSizing: 'border-box', fontFamily: 'sans-serif', fontSize: '14px', zIndex: 10, borderLeft: '1px solid #444', overflowY: 'auto' };
const sectionStyle: React.CSSProperties = { marginBottom: '20px', borderTop: '1px solid #444', paddingTop: '16px' };
const titleStyle: React.CSSProperties = { color: 'white', fontWeight: 'bold', marginBottom: '10px', fontSize: '16px' };
const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' };
const labelStyle: React.CSSProperties = { color: '#aaa', fontSize: '12px', whiteSpace: 'nowrap' };
const inputStyle: React.CSSProperties = { flex: 1, background: '#333', border: '1px solid #555', color: 'white', padding: '4px 8px', borderRadius: '4px', textAlign: 'right', marginLeft: '16px' };

// --- REUSABLE COMPONENTS (Defined outside the main component for clarity and performance) ---
const PropertyInput = ({ label, propName, type = 'number', localProps, handleLocalChange, commitChanges, handleKeyDown }: {
  label: string,
  propName: string,
  type?: string,
  localProps: any,
  handleLocalChange: (prop: string, val: any) => void,
  commitChanges: (prop: string) => void,
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, prop: string) => void
}) => {
  if (!localProps) return null;
  const value = localProps[propName] ?? (type === 'number' ? 0 : '');

  return (
    <div style={rowStyle}>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => handleLocalChange(propName, type === 'number' ? e.target.valueAsNumber || 0 : e.target.value)}
        onBlur={() => commitChanges(propName)}
        onKeyDown={(e) => handleKeyDown(e, propName)}
        style={inputStyle}
      />
    </div>
  );
};

const ReorderButton = ({ children, onClick, title, disabled }: { children: React.ReactNode, onClick: () => void, title: string, disabled: boolean }) => (
  <button onClick={onClick} title={title} disabled={disabled} style={{ background: '#3a3d40', border: '1px solid #555', color: '#ccc', padding: '8px', borderRadius: '4px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1, width: '100%' }}>{children}</button>
);


export const PropertiesPanel: React.FC = () => {
  const { state } = useAppState();
  const { elements, selectedElementIds } = state;
  const selectedElement = selectedElementIds.length === 1 ? elements[selectedElementIds[0]] : null;
  const [localProps, setLocalProps] = useState<CanvasElement | null>(null);

  useEffect(() => { setLocalProps(selectedElement); }, [selectedElement]);

  const handleLocalChange = (property: string, value: any) => {
    if (!localProps) return;
    setLocalProps({ ...localProps, [property]: value });
  };

  const commitChanges = (property: string) => {
    if (!selectedElement || !localProps) return;
    if (selectedElement[property as keyof typeof selectedElement] !== localProps[property as keyof typeof localProps]) {
      webSocketClient.sendElementUpdate({ id: selectedElement.id, [property]: localProps[property as keyof typeof localProps] });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, property: string) => {
    if (e.key === 'Enter') { commitChanges(property); e.currentTarget.blur(); }
  };

  const handleImmediateChange = (property: string, value: any) => {
    if (!selectedElement || !localProps) return;
    setLocalProps({ ...localProps, [property]: value });
    webSocketClient.sendElementUpdate({ id: selectedElement.id, [property]: value });
  };

  const handleReorder = (command: string) => {
    if (!selectedElement) return;
    webSocketClient.sendReorderElement(selectedElement.id, command);
  };

  if (!localProps) {
    return <div style={panelStyle}><div style={titleStyle}>Properties</div><p style={{ color: '#888', textAlign: 'center', marginTop: '40px' }}>{selectedElementIds.length > 1 ? `${selectedElementIds.length} elements selected` : 'No element selected.'}</p></div>;
  }

  const shapeElement = localProps.element_type === 'shape' ? localProps as ShapeElement : null;
  const textElement = localProps.element_type === 'text' ? localProps as TextElement : null;
  const frameElement = localProps.element_type === 'frame' ? localProps as FrameElement : null;
  const commonInputProps = { localProps, handleLocalChange, commitChanges, handleKeyDown };

  return (
    <div style={panelStyle}>
      <div style={{ ...titleStyle, paddingBottom: '8px' }}>
        {localProps.name || localProps.element_type.charAt(0).toUpperCase() + localProps.element_type.slice(1)}
      </div>

      <div style={{ ...sectionStyle, borderTop: 'none', paddingTop: '0' }}>
        <PropertyInput label="Name" propName="name" type="text" {...commonInputProps} />
      </div>

      <div style={sectionStyle}>
        <div style={titleStyle}>Transform</div>
        <PropertyInput label="X" propName="x" {...commonInputProps} />
        <PropertyInput label="Y" propName="y" {...commonInputProps} />
        <PropertyInput label="Width" propName="width" {...commonInputProps} />
        <PropertyInput label="Height" propName="height" {...commonInputProps} />
        <PropertyInput label="Rotation" propName="rotation" {...commonInputProps} />
      </div>

      {textElement && (
        <div style={sectionStyle}>
          <div style={titleStyle}>Text</div>
          <TextSection element={textElement} onPropertyChange={handleImmediateChange} />
        </div>
      )}

      {(shapeElement || frameElement) && (
        <>
          <div style={sectionStyle}>
            <div style={titleStyle}>Fill</div>
            <FillSection element={shapeElement || frameElement} onFillChange={(newFill: Fill) => handleImmediateChange('fill', newFill)} />
          </div>

          <div style={sectionStyle}>
            <div style={{ ...rowStyle, marginBottom: '16px' }}>
              <div style={titleStyle}>Stroke</div>
              {(shapeElement || frameElement).stroke ? (
                <button onClick={() => handleImmediateChange('stroke', null)} style={{ ...inputStyle, width: 'auto', flex: '0 1 auto', cursor: 'pointer', background: '#555' }}>Remove</button>
              ) : (
                <button onClick={() => handleImmediateChange('stroke', { type: 'solid', color: '#888888' })} style={{ ...inputStyle, width: 'auto', flex: '0 1 auto', cursor: 'pointer' }}>Add</button>
              )}
            </div>
            {(shapeElement || frameElement).stroke && (
              <>
                <PropertyInput label="Width" propName="strokeWidth" {...commonInputProps} />
                <FillSection
                  element={{ ...(shapeElement || frameElement), fill: (shapeElement || frameElement).stroke! }}
                  onFillChange={(newStrokeFill: Fill) => handleImmediateChange('stroke', newStrokeFill)}
                />
              </>
            )}
          </div>

          <div style={sectionStyle}>
            <div style={titleStyle}>Corners</div>
            <PropertyInput label="Radius" propName="cornerRadius" {...commonInputProps} />
          </div>
        </>
      )}

      {frameElement && (
        <div style={sectionStyle}>
          <div style={titleStyle}>Frame</div>
          <div style={rowStyle}>
            <label style={labelStyle}>Clip content</label>
            <input type="checkbox" checked={frameElement.clipsContent} onChange={(e) => handleImmediateChange('clipsContent', e.target.checked)} style={{ width: '20px', height: '20px' }} />
          </div>
        </div>
      )}

      <div style={sectionStyle}>
        <div style={titleStyle}>Arrange</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <ReorderButton onClick={() => handleReorder('BRING_FORWARD')} title="Bring Forward" disabled={!selectedElement} />
          <ReorderButton onClick={() => handleReorder('SEND_BACKWARD')} title="Send Backward" disabled={!selectedElement} />
          <ReorderButton onClick={() => handleReorder('BRING_TO_FRONT')} title="Bring to Front" disabled={!selectedElement} />
          <ReorderButton onClick={() => handleReorder('SEND_TO_BACK')} title="Send to Back" disabled={!selectedElement} />
        </div>
      </div>
    </div>
  );
};
