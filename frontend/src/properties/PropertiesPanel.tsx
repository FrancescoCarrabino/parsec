import React from 'react';
import { useAppState } from '../state/AppStateContext';
import { webSocketClient } from '../api/websocket_client';
import type { ShapeElement, TextElement, Fill } from '../state/types';
import { FillSection } from './FillSection';
import { TextSection } from './TextSection';

export const PropertiesPanel: React.FC = () => {
  const { state } = useAppState();
  const { elements, selectedElementIds } = state;

  // Determine the single selected element, if any
  const selectedElement = selectedElementIds.length === 1 ? elements[selectedElementIds[0]] : null;

  // Generic handler to send updates to the backend
  const handlePropertyChange = (property: string, value: any) => {
    if (!selectedElement) return;
    webSocketClient.sendElementUpdate({ id: selectedElement.id, [property]: value });
  };

  // Handler for reordering commands
  const handleReorder = (command: string) => {
    if (!selectedElement) return;
    webSocketClient.sendReorderElement(selectedElement.id, command);
  };

  // --- STYLES ---
  const panelStyle: React.CSSProperties = { width: '280px', height: '100%', background: '#252627', color: '#ccc', padding: '16px', boxSizing: 'border-box', fontFamily: 'sans-serif', fontSize: '14px', zIndex: 10, borderLeft: '1px solid #444', overflowY: 'auto' };
  const sectionStyle: React.CSSProperties = { marginBottom: '20px', borderTop: '1px solid #444', paddingTop: '16px' };
  const titleStyle: React.CSSProperties = { color: 'white', fontWeight: 'bold', marginBottom: '10px', fontSize: '16px' };
  const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' };
  const labelStyle: React.CSSProperties = { color: '#aaa', fontSize: '12px' };
  const inputStyle: React.CSSProperties = { width: '100px', background: '#333', border: '1px solid #555', color: 'white', padding: '4px 8px', borderRadius: '4px', textAlign: 'right' };

  // --- REUSABLE COMPONENTS ---
  const PropertyInput = ({ label, value, propName, type = 'number' }: { label: string, value: string | number, propName: string, type?: string }) => (
    <div style={rowStyle}>
      <label htmlFor={propName} style={labelStyle}>{label}</label>
      <input
        id={propName}
        type={type}
        value={value}
        onChange={(e) => handlePropertyChange(propName, type === 'number' ? Number(e.target.value) : e.target.value)}
        style={{ ...inputStyle, width: '100%' }}
      />
    </div>
  );

  const ReorderButton = ({ children, onClick, title }: { children: React.ReactNode, onClick: () => void, title: string }) => (
    <button onClick={onClick} title={title} disabled={!selectedElement} style={{ background: '#3a3d40', border: '1px solid #555', color: '#ccc', padding: '8px', borderRadius: '4px', cursor: selectedElement ? 'pointer' : 'not-allowed', opacity: selectedElement ? 1 : 0.4, width: '100%' }}>
      {children}
    </button>
  );

  // --- RENDER LOGIC ---

  // Handle the empty/multi-select state
  if (!selectedElement) {
    return (
      <div style={panelStyle}>
        <div style={titleStyle}>Properties</div>
        <p style={{ color: '#888', textAlign: 'center', marginTop: '40px' }}>
          {selectedElementIds.length > 1 ? `${selectedElementIds.length} elements selected` : 'No element selected.'}
        </p>
      </div>
    );
  }

  // Cast the element to specific types for easier access and type safety
  const shapeElement = selectedElement.element_type === 'shape' ? selectedElement as ShapeElement : null;
  const textElement = selectedElement.element_type === 'text' ? selectedElement as TextElement : null;

  return (
    <div style={panelStyle}>
      <div style={{ ...titleStyle, paddingBottom: '8px' }}>
        {selectedElement.name || selectedElement.element_type.charAt(0).toUpperCase() + selectedElement.element_type.slice(1)}
      </div>

      {/* Common Properties */}
      <div style={{ ...sectionStyle, borderTop: 'none', paddingTop: '0' }}>
        <PropertyInput label="Name" value={selectedElement.name || ''} propName="name" type="text" />
      </div>

      <div style={sectionStyle}>
        <div style={titleStyle}>Transform</div>
        <PropertyInput label="X" value={Math.round(selectedElement.x)} propName="x" />
        <PropertyInput label="Y" value={Math.round(selectedElement.y)} propName="y" />
        <PropertyInput label="Width" value={Math.round(selectedElement.width)} propName="width" />
        <PropertyInput label="Height" value={Math.round(selectedElement.height)} propName="height" />
        <PropertyInput label="Rotation" value={Math.round(selectedElement.rotation)} propName="rotation" />
      </div>

      {/* Text-Specific Properties */}
      {textElement && (
        <div style={sectionStyle}>
          <div style={titleStyle}>Text</div>
          <TextSection element={textElement} onPropertyChange={handlePropertyChange} />
        </div>
      )}

      {/* Shape-Specific Properties */}
      {shapeElement && (
        <>
          <div style={sectionStyle}>
            <div style={titleStyle}>Fill</div>
            <FillSection element={shapeElement} onFillChange={(newFill: Fill) => handlePropertyChange('fill', newFill)} />
          </div>
          <div style={sectionStyle}>
            <div style={titleStyle}>Stroke</div>
            <PropertyInput label="Color" value={shapeElement.stroke} propName="stroke" type="text" />
            <PropertyInput label="Width" value={shapeElement.stroke_width} propName="stroke_width" />
          </div>
        </>
      )}

      {/* Arrange Properties */}
      <div style={sectionStyle}>
        <div style={titleStyle}>Arrange</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <ReorderButton onClick={() => handleReorder('BRING_FORWARD')} title="Bring Forward">Forward</ReorderButton>
          <ReorderButton onClick={() => handleReorder('SEND_BACKWARD')} title="Send Backward">Backward</ReorderButton>
          <ReorderButton onClick={() => handleReorder('BRING_TO_FRONT')} title="Bring to Front">To Front</ReorderButton>
          <ReorderButton onClick={() => handleReorder('SEND_TO_BACK')} title="Send to Back">To Back</ReorderButton>
        </div>
      </div>
    </div>
  );
};
