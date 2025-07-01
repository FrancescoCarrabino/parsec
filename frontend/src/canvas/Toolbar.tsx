import React from 'react';
import { useAppState } from '../state/AppStateContext';
import type { ActiveTool } from '../state/types';

// ToolButton component (no changes needed here)
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
  activeTool: ActiveTool | undefined, // It's good practice to allow for an undefined activeTool
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

// Toolbar component
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

      {/* --- ADD THIS LINE --- */}
      <ToolButton title="Text (T)" tool="text" icon="T" activeTool={state.activeTool} onClick={handleToolChange} />
      <ToolButton title="Frame (F)" tool="frame" icon="[ ]" activeTool={state.activeTool} onClick={handleToolChange} />

    </div>
  );
};
