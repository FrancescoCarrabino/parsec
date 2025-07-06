// parsec-frontend/src/components/ComponentsPanel.tsx

import React from 'react';
import { useAppState } from '../state/AppStateContext';
import type { ComponentDefinition } from '../state/types';

const panelStyle: React.CSSProperties = {
  width: '260px',
  background: '#25282B',
  color: '#FFFFFF',
  padding: '8px',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'sans-serif',
};

const headerStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 'bold',
  padding: '8px 4px',
  borderBottom: '1px solid #444',
  marginBottom: '8px',
};

const componentItemStyle: React.CSSProperties = {
  background: '#333639',
  padding: '10px 8px',
  borderRadius: '4px',
  marginBottom: '8px',
  cursor: 'grab',
  userSelect: 'none', // Prevent text selection while dragging
  border: '1px solid #444',
};

const componentNameStyle: React.CSSProperties = {
  fontWeight: 'bold',
  marginBottom: '4px',
};

const componentInfoStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#999',
};


// A single draggable item in the panel
const ComponentItem: React.FC<{ definition: ComponentDefinition }> = ({ definition }) => {

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.effectAllowed = 'copy';

    // This is where we package the data for the drop event
    const dragData = {
      definitionId: definition.id,
      // We calculate the cursor's position within the dragged item as a ratio.
      // This allows the Canvas to place the item correctly, not just from its top-left.
      offsetX: e.nativeEvent.offsetX / e.currentTarget.offsetWidth,
      offsetY: e.nativeEvent.offsetY / e.currentTarget.offsetHeight,
    };
    
    e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
  };

  return (
    <div
      style={componentItemStyle}
      draggable="true"
      onDragStart={handleDragStart}
    >
      <div style={componentNameStyle}>{definition.name}</div>
      <div style={componentInfoStyle}>
        {definition.template_elements.length} elements
      </div>
    </div>
  );
};


// The main panel component
export const ComponentsPanel = () => {
  const { state } = useAppState();
  const componentDefinitions = Object.values(state.componentDefinitions);

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>Components</div>
      {componentDefinitions.length === 0 ? (
        <div style={{...componentInfoStyle, padding: '8px'}}>
          No components defined yet. Select elements and use the AI prompt to create one.
        </div>
      ) : (
        componentDefinitions.map(def => (
          <ComponentItem key={def.id} definition={def} />
        ))
      )}
    </div>
  );
};