import React from 'react';
import { useAppState } from '../state/AppStateContext';
import type { CanvasElement } from '../state/types';
import { webSocketClient } from '../api/websocket_client';

const ElementIcon = ({ element }: { element: CanvasElement }) => {
  if (element.element_type === 'group') return <span style={{ fontSize: '18px', lineHeight: 1 }}>🗂️</span>;
  if (element.element_type === 'shape') {
    if (element.shape_type === 'rect') return <span style={{ fontSize: '18px', lineHeight: 1 }}>■</span>;
    if (element.shape_type === 'circle') return <span style={{ fontSize: '18px', lineHeight: 1 }}>●</span>;
  }
  return <span style={{ fontSize: '18px', lineHeight: 1 }}>?</span>;
};

const VisibilityIcon = ({ isVisible }: { isVisible: boolean }) => {
  return <span style={{ fontSize: '16px', opacity: isVisible ? 1 : 0.4, cursor: 'pointer' }}>👁️</span>;
};

export const LayersPanel = () => {
  const { state, dispatch } = useAppState();
  const { elements, selectedElementIds } = state;

  const sortedElements = Object.values(elements).sort((a, b) => b.zIndex - a.zIndex);

  const handleLayerClick = (e: React.MouseEvent, id: string) => {
    const isShiftPressed = e.shiftKey;
    const isSelected = selectedElementIds.includes(id);
    if (isShiftPressed) {
      if (isSelected) dispatch({ type: 'REMOVE_FROM_SELECTION', payload: { id } });
      else dispatch({ type: 'ADD_TO_SELECTION', payload: { id } });
    } else {
      dispatch({ type: 'SET_SELECTION', payload: { ids: [id] } });
    }
  };

  const handleVisibilityToggle = (e: React.MouseEvent, element: CanvasElement) => {
    e.stopPropagation();
    const newVisibility = !element.isVisible;
    const updatePayload = { ...element, isVisible: newVisibility };
    dispatch({ type: 'ELEMENT_UPDATED', payload: updatePayload });
    webSocketClient.sendElementUpdate({ id: element.id, isVisible: newVisibility });
  };

  const canGroup = selectedElementIds.length > 1;
  const canUngroup = selectedElementIds.length === 1 && elements[selectedElementIds[0]]?.element_type === 'group';

  const handleGroup = () => {
    if (!canGroup) return;
    webSocketClient.sendGroupElements(selectedElementIds);
  };

  const handleUngroup = () => {
    if (!canUngroup) return;
    webSocketClient.sendUngroupElement(selectedElementIds[0]);
  };

  const panelStyle: React.CSSProperties = { width: '240px', height: '100%', background: '#252627', color: '#ccc', padding: '8px', boxSizing: 'border-box', fontFamily: 'sans-serif', fontSize: '14px', borderRight: '1px solid #444', display: 'flex', flexDirection: 'column' };
  const titleStyle: React.CSSProperties = { color: 'white', fontWeight: 'bold', padding: '8px 8px 16px 8px', borderBottom: '1px solid #444', fontSize: '16px', display: 'flex', alignItems: 'center' };
  const listStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: '8px 0', flex: 1, overflowY: 'auto' };
  const itemBaseStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', padding: '8px', borderRadius: '4px', cursor: 'pointer', marginBottom: '4px', gap: '8px' };
  const buttonStyle = (enabled: boolean): React.CSSProperties => ({ background: '#3a3d40', border: '1px solid #555', color: '#ccc', cursor: enabled ? 'pointer' : 'not-allowed', padding: '4px 8px', borderRadius: '4px', opacity: enabled ? 1 : 0.4 });

  return (
    <div style={panelStyle}>
      <div style={titleStyle}>
        <span>Layers</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button onClick={handleGroup} disabled={!canGroup} style={buttonStyle(canGroup)}>Group</button>
          <button onClick={handleUngroup} disabled={!canUngroup} style={buttonStyle(canUngroup)}>Ungroup</button>
        </div>
      </div>
      <ul style={listStyle}>
        {sortedElements.map(element => {
          const isSelected = selectedElementIds.includes(element.id);
          const itemStyle: React.CSSProperties = { ...itemBaseStyle, background: isSelected ? 'rgba(0, 122, 255, 0.3)' : 'transparent', color: isSelected ? 'white' : '#ccc', opacity: element.isVisible ? 1 : 0.5, paddingLeft: element.parentId ? '24px' : '8px' };
          return (
            <li key={element.id} style={itemStyle} onClick={(e) => handleLayerClick(e, element.id)}>
              <ElementIcon element={element} />
              <span style={{ flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{element.id}</span>
              <div onClick={(e) => handleVisibilityToggle(e, element)}>
                <VisibilityIcon isVisible={element.isVisible} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
