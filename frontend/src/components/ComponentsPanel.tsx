// parsec-frontend/src/components/ComponentsPanel.tsx
import React from 'react';
import { useAppState } from '../state/AppStateContext';
import type { ComponentDefinition } from '../state/types';

// ... (All styles are correct)
const PanelStyles: React.CSSProperties = { width: '260px', background: '#25282c', color: '#ffffff', padding: '8px', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif', borderLeft: '1px solid #444' };
const HeaderStyles: React.CSSProperties = { fontSize: '14px', fontWeight: 'bold', padding: '8px', borderBottom: '1px solid #444', marginBottom: '8px' };
const ComponentItemStyles: React.CSSProperties = { padding: '10px', background: '#3a3d40', borderRadius: '4px', marginBottom: '8px', cursor: 'grab', userSelect: 'none' };

const ComponentItem: React.FC<{ definition: ComponentDefinition }> = ({ definition }) => {
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    const data = JSON.stringify({
      type: 'parsec-component',
      definitionId: definition.id,
      offsetX,
      offsetY,
    });
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', data);
  };

  return (
    <div style={ComponentItemStyles} draggable onDragStart={handleDragStart}>
      {definition.name}
    </div>
  );
};

export const ComponentsPanel = () => {
  const { state } = useAppState();
  const definitions = Object.values(state.componentDefinitions);
  return (
    <aside style={PanelStyles}>
      <div style={HeaderStyles}>Components</div>
      {definitions.length > 0 ? (
        definitions.map(def => <ComponentItem key={def.id} definition={def} />)
      ) : (
        <p style={{ fontSize: '12px', color: '#888', padding: '8px' }}>Create a component to see it here.</p>
      )}
    </aside>
  );
};