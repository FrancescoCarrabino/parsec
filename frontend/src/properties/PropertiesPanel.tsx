// parsec-frontend/src/properties/PropertiesPanel.tsx
import React from 'react';
import { useAppState } from '../state/AppStateContext';
import { webSocketClient } from '../api/websocket_client';
import type { ShapeElement, TextElement, FrameElement, PathElement, Fill, CanvasElement, ComponentInstanceElement } from '../state/types';
import { FillSection } from './FillSection';
import { TextPropertiesSection } from './TextPropertiesSection';
import { InstancePropertiesSection } from './InstancePropertiesSection';
import { PropertyGroup, PropertyRow, PropertyLabel, StringInput } from './CommonControls';

const panelStyle: React.CSSProperties = { width: '280px', height: '100%', background: '#252627', color: '#ccc', padding: '16px', boxSizing: 'border-box', fontFamily: 'sans-serif', fontSize: '14px', zIndex: 10, borderLeft: '1px solid #444', overflowY: 'auto' };
const titleStyle: React.CSSProperties = { color: 'white', fontWeight: 'bold', marginBottom: '10px', fontSize: '16px' };
const buttonStyle: React.CSSProperties = { background: '#3a3d40', border: '1px solid #555', color: '#ccc', padding: '8px', borderRadius: '4px', cursor: 'pointer', width: '100%' };
const arrangeButtonStyle: React.CSSProperties = { ...buttonStyle, padding: '4px' };
const disabledButtonStyle: React.CSSProperties = { ...buttonStyle, cursor: 'not-allowed', opacity: 0.4 };

// NEW: Speaker Notes Text Area Component
const SpeakerNotesSection: React.FC<{ element: FrameElement; onUpdate: (prop: string, val: any) => void; }> = ({ element, onUpdate }) => {
  return (
    <PropertyGroup title="Speaker Notes">
      <textarea
        value={element.speakerNotes}
        onChange={(e) => onUpdate('speakerNotes', e.target.value)}
        placeholder="Type your notes here..."
        style={{
          width: '100%',
          boxSizing: 'border-box',
          height: '120px',
          background: '#1e1e1e',
          color: '#ccc',
          border: '1px solid #444',
          borderRadius: '4px',
          padding: '8px',
          fontFamily: 'inherit',
          fontSize: '13px',
          resize: 'vertical'
        }}
      />
    </PropertyGroup>
  );
};


const PropertyInput = ({ label, propName, type = 'number', element, onUpdate }: { label: string; propName: string; type?: string; element: CanvasElement; onUpdate: (prop: string, val: any) => void; }) => {
  const value = element[propName as keyof typeof element] ?? (type === 'number' ? 0 : '');
  return (<PropertyRow><PropertyLabel>{label}</PropertyLabel><StringInput type={type} value={String(value)} onChange={(e) => onUpdate(propName, type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)} /></PropertyRow>);
};

export const PropertiesPanel: React.FC = () => {
  const { state } = useAppState();
  const { elements, componentDefinitions, selectedElementIds } = state;
  const selectedElement = selectedElementIds.length === 1 ? elements[selectedElementIds[0]] : null;

  const handlePropertyChange = (property: string, value: any) => { if (!selectedElement) return; webSocketClient.sendElementUpdate({ id: selectedElement.id, [property]: value }); };
  const handleArrange = (command: string) => { if (!selectedElement) return; webSocketClient.sendReorderElement(selectedElement.id, command); };
  const handleGroup = () => { if (selectedElementIds.length > 1) { webSocketClient.sendGroupElements(selectedElementIds); } };
  const handleUngroup = () => { if (selectedElement && (selectedElement.element_type === 'group' || selectedElement.element_type === 'frame')) { webSocketClient.sendUngroupElement(selectedElement.id); } };

  if (!selectedElement) {
    const canGroup = selectedElementIds.length > 1;
    return (<div style={panelStyle}><div style={titleStyle}>Properties</div><p style={{ color: '#888', textAlign: 'center', marginTop: '40px' }}>{selectedElementIds.length > 1 ? `${selectedElementIds.length} elements selected` : 'No element selected.'}</p><PropertyGroup title="Grouping"><button onClick={handleGroup} style={canGroup ? buttonStyle : disabledButtonStyle} disabled={!canGroup}>Group Selection (Ctrl+G)</button></PropertyGroup></div>);
  }
  
  if (selectedElement.element_type === 'component_instance') {
    const instance = selectedElement as ComponentInstanceElement;
    const definition = componentDefinitions[instance.definition_id];
    if (!definition) { return (<div style={panelStyle}><div style={titleStyle}>Component</div><p>Loading definition...</p></div>); }
    return ( <div style={panelStyle}> <InstancePropertiesSection instance={instance} definition={definition} /> </div> );
  }

  const textElement = selectedElement.element_type === 'text' ? selectedElement as TextElement : null;
  const frameElement = selectedElement.element_type === 'frame' ? selectedElement as FrameElement : null;
  const shapeElement = selectedElement.element_type === 'shape' ? selectedElement as ShapeElement : null;
  const pathElement = selectedElement.element_type === 'path' ? selectedElement as PathElement : null;
  const groupElement = selectedElement.element_type === 'group' ? selectedElement : null;

  const canUngroup = !!(frameElement || groupElement);
  const fillableElement = shapeElement || frameElement || pathElement;
  const cornerElement = shapeElement || frameElement;

  return (
    <div style={panelStyle}>
      <div style={{ ...titleStyle, paddingBottom: '8px' }}>{selectedElement.name || selectedElement.element_type}</div>
      <PropertyGroup title="Grouping"><button onClick={handleUngroup} style={canUngroup ? buttonStyle : disabledButtonStyle} disabled={!canUngroup}>Ungroup (Ctrl+Shift+G)</button></PropertyGroup>
      <PropertyGroup title="Transform"><PropertyInput label="Name" propName="name" type="text" element={selectedElement} onUpdate={handlePropertyChange} /><PropertyInput label="X" propName="x" element={selectedElement} onUpdate={handlePropertyChange} /><PropertyInput label="Y" propName="y" element={selectedElement} onUpdate={handlePropertyChange} /><PropertyInput label="Width" propName="width" element={selectedElement} onUpdate={handlePropertyChange} /><PropertyInput label="Height" propName="height" element={selectedElement} onUpdate={handlePropertyChange} /><PropertyInput label="Rotation" propName="rotation" element={selectedElement} onUpdate={handlePropertyChange} /></PropertyGroup>
      {textElement && ( <PropertyGroup title="Text"> <TextPropertiesSection element={textElement} onPropertyChange={handlePropertyChange} /> </PropertyGroup> )}
      {fillableElement && (<>
        <PropertyGroup title="Fill"><FillSection fill={fillableElement.fill} onFillChange={(newFill: Fill | null) => handlePropertyChange('fill', newFill)} /></PropertyGroup>
        <PropertyGroup title="Stroke">
          {fillableElement.stroke ? <button onClick={() => handlePropertyChange('stroke', null)} style={{ ...buttonStyle, marginBottom: '8px' }} >Remove Stroke</button> : <button onClick={() => handlePropertyChange('stroke', { type: 'solid', color: '#888888' })} style={{ ...buttonStyle, marginBottom: '8px' }}>Add Stroke</button>}
          {fillableElement.stroke && (<>
            <PropertyInput label="Width" propName="strokeWidth" element={selectedElement} onUpdate={handlePropertyChange} />
            <FillSection fill={fillableElement.stroke} onFillChange={(newStrokeFill: Fill | null) => handlePropertyChange('stroke', newStrokeFill)} />
          </>)}
        </PropertyGroup>
      </>)}
      {cornerElement && <PropertyGroup title="Corners"><PropertyInput label="Radius" propName="cornerRadius" element={selectedElement} onUpdate={handlePropertyChange} /></PropertyGroup>}
      
      {/* --- NEW SECTION FOR FRAME-SPECIFIC PROPERTIES --- */}
      {frameElement && (
        <>
          <PropertyGroup title="Frame">
            <PropertyRow>
              <PropertyLabel>Clip content</PropertyLabel>
              <input type="checkbox" checked={frameElement.clipsContent} onChange={(e) => handlePropertyChange('clipsContent', e.target.checked)} style={{ width: '20px', height: '20px' }} />
            </PropertyRow>
          </PropertyGroup>
          {/* Render the new Speaker Notes section here */}
          <SpeakerNotesSection element={frameElement} onUpdate={handlePropertyChange} />
        </>
      )}

      <PropertyGroup title="Arrange"><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}><button onClick={() => handleArrange('BRING_FORWARD')} style={arrangeButtonStyle}>Forward</button><button onClick={() => handleArrange('SEND_BACKWARD')} style={arrangeButtonStyle}>Backward</button><button onClick={() => handleArrange('BRING_TO_FRONT')} style={arrangeButtonStyle}>To Front</button><button onClick={() => handleArrange('SEND_TO_BACK')} style={arrangeButtonStyle}>To Back</button></div></PropertyGroup>
    </div>
  );
};