import React, { useMemo, useRef } from 'react';
import { useAppState } from '../state/AppStateContext';
import type { CanvasElement } from '../state/types';
import { useDrag, useDrop } from 'react-dnd';
import { webSocketClient } from '../api/websocket_client';

const ItemTypes = { LAYER: 'layer' };

// --- STYLES (no changes) ---
const panelStyle: React.CSSProperties = { width: '240px', height: '100%', background: '#252627', color: '#ccc', padding: '16px 8px', boxSizing: 'border-box', fontFamily: 'sans-serif', fontSize: '13px', borderRight: '1px solid #444', overflowY: 'auto', display: 'flex', flexDirection: 'column' };
const titleStyle: React.CSSProperties = { color: 'white', fontWeight: 'bold', padding: '0 8px', marginBottom: '10px', borderBottom: '1px solid #444', paddingBottom: '8px', fontSize: '16px' };
const layerListStyle: React.CSSProperties = { flexGrow: 1, display: 'flex', flexDirection: 'column' };

// --- LayerItem Component (no changes needed, it is correct) ---
interface LayerItemProps {
  element: CanvasElement;
  depth: number;
}
const LayerItem: React.FC<LayerItemProps> = ({ element, depth }) => {
  const { state, dispatch } = useAppState();

  const refContent = useRef<HTMLDivElement>(null);
  const refAbove = useRef<HTMLDivElement>(null);
  const refBelow = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag] = useDrag(() => ({
    type: ItemTypes.LAYER,
    item: { id: element.id, parentId: element.parentId },
  }));

  const createDropHook = (position: 'above' | 'below' | 'on') => {
    return useDrop(() => ({
      accept: ItemTypes.LAYER,
      drop: (item: { id: string, parentId: string | null }) => {
        if (item.id === element.id) return;
        if (position === 'on') {
          webSocketClient.sendReparentElement(item.id, element.id);
        } else if (item.parentId === element.parentId) {
          webSocketClient.sendReorderLayer(item.id, element.id, position);
        }
      },
      canDrop: (item) => {
        if (item.id === element.id) return false;
        if (position === 'on') return element.element_type === 'frame' || element.element_type === 'group';
        return item.parentId === element.parentId;
      },
      collect: (monitor) => ({ isOver: monitor.isOver() && monitor.canDrop() }),
    }));
  };

  const [{ isOver: isOverAbove }, dropAbove] = createDropHook('above');
  const [{ isOver: isOverReparent }, dropReparent] = createDropHook('on');
  const [{ isOver: isOverBelow }, dropBelow] = createDropHook('below');

  dropAbove(refAbove);
  drag(dropReparent(refContent));
  dropBelow(refBelow);

  const isSelected = state.selectedElementIds.includes(element.id);
  const handleSelect = () => dispatch({ type: 'SET_SELECTION', payload: { ids: [element.id] } });

  const dropZoneStyle: React.CSSProperties = { height: '5px' };
  const dropIndicatorStyle: React.CSSProperties = { height: '2px', background: '#00aaff', width: '100%', transform: 'translateY(-1px)' };

  const itemContentStyle: React.CSSProperties = {
    padding: '4px 8px', marginLeft: `${depth * 20}px`, borderRadius: '4px', cursor: 'move',
    backgroundColor: isSelected ? 'rgba(0, 122, 255, 0.4)' : isOverReparent ? 'rgba(0, 255, 122, 0.2)' : 'transparent',
    opacity: isDragging ? 0.4 : 1, display: 'flex', alignItems: 'center', gap: '8px',
    border: isOverReparent ? '1px dashed rgba(0, 255, 122, 0.5)' : '1px solid transparent',
  };

  const Icon = () => <span style={{ opacity: 0.8 }}>{element.element_type === 'frame' ? '🖼️' : element.element_type === 'group' ? '📁' : element.element_type === 'text' ? 'T' : element.element_type === 'ellipse' ? '○' : '📄'}</span>;

  return (
    <div key={element.id}>
      <div ref={refAbove} style={dropZoneStyle}>{isOverAbove && <div style={dropIndicatorStyle} />}</div>
      <div ref={refContent} style={itemContentStyle} onMouseDown={handleSelect}>
        <Icon />
        <span>{element.name || element.id.substring(0, 8)}</span>
      </div>
      <div ref={refBelow} style={dropZoneStyle}>{isOverBelow && <div style={dropIndicatorStyle} />}</div>
    </div>
  );
};


// --- Main LayersPanel Component with CORRECTED Render Logic ---
export const LayersPanel: React.FC = () => {
  const { state } = useAppState();
  const { elements } = state;

  // useMemo will re-calculate this entire flat list whenever `elements` changes.
  const layerTree = useMemo(() => {
    const tree: React.ReactNode[] = [];
    const elementsArray = Object.values(elements);

    // This function now builds a flat array, it does not return JSX.
    const buildTree = (parentId: string | null, depth: number) => {
      const children = elementsArray
        .filter(el => el.parentId === parentId)
        .sort((a, b) => b.zIndex - a.zIndex); // Sort siblings by zIndex

      children.forEach(element => {
        // Push the component into the flat array
        tree.push(
          <LayerItem key={element.id} element={element} depth={depth} />
        );
        // Recurse to add its children to the flat array
        buildTree(element.id, depth + 1);
      });
    };

    buildTree(null, 0); // Start building from the root
    return tree;
  }, [elements]); // Dependency array ensures this runs when state updates

  const [{ isOverRoot }, dropRoot] = useDrop(() => ({
    accept: ItemTypes.LAYER,
    drop: (item: { id: string, parentId: string | null }) => {
      if (item.parentId) {
        webSocketClient.sendReparentElement(item.id, null);
      }
    },
    canDrop: (item) => !!item.parentId,
    collect: (monitor) => ({ isOverRoot: monitor.isOver() && monitor.canDrop() }),
  }));

  const rootDropZoneStyle: React.CSSProperties = {
    flexGrow: 1, backgroundColor: isOverRoot ? 'rgba(0, 255, 122, 0.1)' : 'transparent',
    borderRadius: '8px', border: isOverRoot ? '2px dashed rgba(0, 255, 122, 0.4)' : '2px dashed transparent',
    margin: '4px 0', transition: 'all 150ms ease-in-out',
  };

  return (
    <div style={panelStyle}>
      <div style={titleStyle}>Layers</div>
      <div style={layerListStyle}>
        <div>
          {/* Render the pre-built flat array of components */}
          {layerTree}
        </div>
        <div ref={dropRoot} style={rootDropZoneStyle} />
      </div>
    </div>
  );
};
