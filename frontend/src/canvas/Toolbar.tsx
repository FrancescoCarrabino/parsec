import React from 'react';
import { useAppState } from '../state/AppStateContext';
import type { ActiveTool } from '../state/types';
import clsx from 'clsx'; // For conditional class names

// Import icons from lucide-react
import { MousePointer, Type, Square, Circle, PenTool, Brackets } from 'lucide-react';

import styles from './Toolbar.module.css'; // Import the CSS module

// Define a type for our tools
interface Tool {
  id: ActiveTool;
  icon: React.ReactNode;
  title: string;
}

// Define the tools using lucide icons and our new design system
const TOOLS: Tool[] = [
  { id: 'select', icon: <MousePointer size={20} />, title: 'Select (V)' },
  { id: 'rectangle', icon: <Square size={20} />, title: 'Rectangle (R)' },
  { id: 'ellipse', icon: <Circle size={20} />, title: 'Ellipse (O)' },
  { id: 'text', icon: <Type size={20} />, title: 'Text (T)' },
  { id: 'pen', icon: <PenTool size={20} />, title: 'Pen (P)' },
  { id: 'frame', icon: <Brackets size={20} />, title: 'Frame (F)' },
];

export const Toolbar = () => {
  const { state, dispatch } = useAppState();

  const handleToolChange = (toolId: ActiveTool) => {
    dispatch({ type: 'SET_ACTIVE_TOOL', payload: { tool: toolId } });
  };

  return (
    <div className={styles.toolbar}>
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          className={clsx(styles.toolButton, { [styles.active]: state.activeTool === tool.id })}
          onClick={() => handleToolChange(tool.id)}
          title={tool.title}
        >
          {tool.icon}
        </button>
      ))}
    </div>
  );
};