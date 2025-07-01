import React, { useMemo, useRef } from 'react';
import { useAppState } from '../state/AppStateContext';
import type { CanvasElement } from '../state/types';
// --- CORRECTED IMPORT: DropTargetMonitor is removed ---
import { useDrag, useDrop } from 'react-dnd';
import { webSocketClient } from '../api/websocket_client';

// A unique type for our draggable items to be recognized by react-dnd
const ItemTypes = {
  LAYER: 'layer',
};

// --- Reusable Styles ---
const panelStyle: React.CSSProperties = {
  width: '240px',
  height: '100%',
  background: '#252627',
  color: '#ccc',
  padding: '16px 8px',
  boxSizing: 'border-box',
  fontFamily: 'sans-serif',
  fontSize: '13px',
  borderRight: '1px solid #444',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
};

const titleStyle: React.CSSProperties = {
  color: 'white',
  fontWeight: 'bold',
  padding: '0 8px',
  marginBottom: '10px',
  borderBottom: '1px solid #444',
  paddingBottom: '8px',
  fontSize: '16px',
};

const layerListStyle: React.CSSProperties = {
  flexGrow: 1,
};

// --- Recursive Layer Item Component with Drag-and-Drop ---
interface LayerItemProps {
  element: CanvasElement;
  depth: number;
  allElements: CanvasElement[];
}

const LayerItem: React.FC<LayerItemProps> = ({ element, depth, allElements }) => {
  const { state, dispatch } = useAppState();
  const ref = useRef<HTMLDivElement>(null); // Ref for the drop target div

  // Setup for making this component draggable
  const [{ isDragging }, drag] = useDrag(() => ({
    type: ItemTypes.LAYER,
    item: { id: element.id },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }));

  // Setup for making this component a drop target
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: ItemTypes.LAYER,
    drop: (item: { id: string }) => {
      if (element.element_type === 'frame' || element.element_type === 'group') {
        webSocketClient.sendReparentElement(item.id, element.id);
      }
    },
    canDrop: (item: { id: string }) => {
      if (item.id === element.id) return false;
      const isContainer = element.element_type === 'frame' || element.element_type === 'group';
      return isContainer;
    },
    // --- CORRECTED: The type for 'monitor' is inferred automatically by TypeScript ---
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
      canDrop: !!monitor.canDrop(),
    }),
  }));

  // Attach both drag and drop refs to the same DOM node
  drag(drop(ref));

  const isSelected = state.selectedElementIds.includes(element.id);
  const handleSelect = () => { dispatch({ type: 'SET_SELECTION', payload: { ids: [element.id] } }); };

  const itemStyle: React.CSSProperties = {
    padding: `4px 8px`,
    paddingLeft: `${8 + depth * 20}px`,
    borderRadius: '4px',
    marginBottom: '2px',
    cursor: 'move',
    backgroundColor: isSelected
      ? 'rgba(0, 122, 255, 0.4)'
      : isOver && canDrop
        ? 'rgba(0, 255, 122, 0.2)'
        : 'transparent',
    opacity: isDragging ? 0.4 : 1,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    border: isOver && canDrop ? '1px dashed rgba(0, 255, 122, 0.5)' : '1px dashed transparent',
    transition: 'background-color 150ms ease-in-out, border 150ms ease-in-out',
  };

  const children = (element.element_type === 'group' || element.element_type === 'frame')
    ? allElements.filter(child => child.parentId === element.id)
    : [];

  const Icon = () => (
    <span style={{ opacity: 0.8 }}>
      {element.element_type === 'frame' ? '🖼️' : element.element_type === 'group' ? '📁' : element.element_type === 'text' ? 'T' : '📄'}
    </span>
  );

  return (
    <>
      <div ref={ref} style={itemStyle} onMouseDown={handleSelect}>
        <Icon />
        <span>{element.name || element.id.substring(0, 8)}</span>
      </div>
      {children.map(child => (
        <LayerItem
          key={child.id}
          element={child}
          depth={depth + 1}
          allElements={allElements}
        />
      ))}
    </>
  );
};

// --- Main Layers Panel Component ---
export const LayersPanel: React.FC = () => {
  const { state } = useAppState();
  const { elements } = state;

  const sortedElements = useMemo(() => {
    return Object.values(elements).sort((a, b) => b.zIndex - a.zIndex);
  }, [elements]);

  const topLevelItems = sortedElements.filter(el => !el.parentId);

  return (
    <div style={panelStyle}>
      <div style={titleStyle}>Layers</div>
      <div style={layerListStyle}>
        {topLevelItems.length > 0 ? (
          topLevelItems.map(element => (
            <LayerItem
              key={element.id}
              element={element}
              depth={0}
              allElements={sortedElements}
            />
          ))
        ) : (
          <p style={{ textAlign: 'center', color: '#888', fontSize: '12px' }}>Canvas is empty</p>
        )}
      </div>
    </div>
  );
};
