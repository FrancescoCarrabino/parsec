import React from 'react';
import { useAppState } from '../state/AppStateContext';
import type { ActiveTool } from '../state/types';

const ToolButton = ({
  title,
  tool,
  icon,
  activeTool,
  onClick
}: {
  title: string,
  tool: ActiveTool,
  icon: string,
  activeTool: ActiveTool,
  onClick: (tool: ActiveTool) => void
}) => {
  const isActive = activeTool === tool;
  const style: React.CSSProperties = {
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    background: isActive ? '#007aff' : 'transparent',
    color: isActive ? 'white' : '#ccc',
    borderRadius: '4px',
    fontSize: '24px',
    border: 'none',
  };
  return (
    <button title={title} onClick={() => onClick(tool)} style={style}>
      {icon}
    </button>
  );
};

export const Toolbar = () => {
  const { state, dispatch } = useAppState();

  const handleToolChange = (tool: ActiveTool) => {
    dispatch({ type: 'SET_ACTIVE_TOOL', payload: { tool } });
  };

  const toolbarStyle: React.CSSProperties = {
    position: 'absolute',
    top: '16px',
    left: '16px',
    background: '#252627',
    padding: '8px',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    zIndex: 20,
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
  };

  return (
    <div style={toolbarStyle}>
      <ToolButton title="Select (V)" tool="select" icon="➚" activeTool={state.activeTool} onClick={handleToolChange} />
      <ToolButton title="Rectangle (R)" tool="rectangle" icon="■" activeTool={state.activeTool} onClick={handleToolChange} />
      {/* Future tools like Pen (P) or Text (T) will go here */}
    </div>
  );
};
