// src/components/TextEditorOverlay.tsx

import React, { useRef, useEffect } from 'react';
import Konva from 'konva';
import { useAppState } from '../state/AppStateContext';
import { webSocketClient } from '../api/websocket_client';
import type { TextElement } from '../state/types';
import styles from './TextEditorOverlay.module.css';

interface TextEditorOverlayProps {
  stageRef: React.RefObject<Konva.Stage>;
}

export const TextEditorOverlay = ({ stageRef }: TextEditorOverlayProps) => {
  const { state, dispatch } = useAppState();
  const editingElementId = state.editingElementId;
  const editingNode = editingElementId ? state.elements[editingElementId] : null;
  const editingText = (editingNode?.element_type === 'text') ? editingNode as TextElement : null;

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // This effect now correctly focuses and sizes the textarea on initial render
  useEffect(() => {
    if (editingText && textareaRef.current) {
      const textarea = textareaRef.current;
      
      // We must set the value before measuring scrollHeight for accuracy
      textarea.value = editingText.content; 
      
      // Auto-resize the textarea to fit its content
      textarea.style.height = 'auto'; // Reset height
      textarea.style.height = `${textarea.scrollHeight}px`;
      
      textarea.focus();
      textarea.select();
    }
  }, [editingText]); // Run only when the editing element changes

  if (!editingText || !stageRef.current) {
    return null;
  }

  const finishEditing = () => {
    if (!editingText || !textareaRef.current) return;
    const newContent = textareaRef.current.value;
    if (newContent !== editingText.content) {
      // Send the final content. The backend or reducer should handle recalculating the
      // new dimensions of the Konva.Text object based on this content.
      webSocketClient.sendElementUpdate({ id: editingText.id, content: newContent }, true);
    }
    dispatch({ type: 'SET_EDITING_ELEMENT_ID', payload: { id: null } });
  };
  
  const handleBlur = () => finishEditing();
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      finishEditing();
    }
    if (e.key === 'Escape') {
      dispatch({ type: 'SET_EDITING_ELEMENT_ID', payload: { id: null } });
    }
  };

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    // Auto-resize textarea height as user types
    const textarea = e.currentTarget;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  const getStyle = (): React.CSSProperties => {
    const stage = stageRef.current;
    if (!stage) return { display: 'none' };

    const konvaNode = stage.findOne('#' + editingText.id) as Konva.Text;
    if (!konvaNode) return { display: 'none' };

    const stageRect = stage.container().getBoundingClientRect();
    const absPos = konvaNode.getAbsolutePosition();
    const absScale = konvaNode.getAbsoluteScale();
    
    const areaPosition = {
      x: stageRect.left + absPos.x - (konvaNode.offsetX() * absScale.x),
      y: stageRect.top + absPos.y - (konvaNode.offsetY() * absScale.y),
    };
    
    const finalFontSize = konvaNode.fontSize() * absScale.y;
    const finalLineHeight = (konvaNode.lineHeight() || 1.2); // CSS lineHeight is better as a multiplier
    
    // --- THIS IS THE KEY FIX ---
    // If the Konva text has the `wrap` property set to 'none' (the default),
    // it means the width is dynamic. We should let the textarea grow.
    // Otherwise, we fix the width to match the Konva node.
    const isWrapped = konvaNode.wrap() !== 'none';
    const finalWidth = isWrapped ? (konvaNode.width() * absScale.x) : 'auto';
    // For auto-width text, provide a min-width to prevent it from being too small.
    const minWidth = konvaNode.width() * absScale.x;


    return {
      position: 'absolute',
      top: `${areaPosition.y}px`,
      left: `${areaPosition.x}px`,
      
      // Apply the new width logic
      width: typeof finalWidth === 'number' ? `${finalWidth}px` : finalWidth,
      minWidth: `${minWidth}px`,
      // Height will be managed by the onInput handler via scrollHeight
      height: 'auto', 
      
      fontSize: `${finalFontSize}px`,
      lineHeight: finalLineHeight,
      fontFamily: konvaNode.fontFamily(),
      textAlign: konvaNode.align() as 'left' | 'center' | 'right',
      color: konvaNode.fill(),
      
      transformOrigin: 'top left',
      transform: `rotate(${konvaNode.rotation()}deg)`,
      
      padding: `${konvaNode.padding() * absScale.y}px ${konvaNode.padding() * absScale.x}px`,
    };
};

  return (
    <textarea
      ref={textareaRef}
      className={styles.textarea}
      style={getStyle()}
      // Use controlled `value` from useEffect to ensure it's set before measuring
      // defaultValue={editingText.content} 
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onInput={handleInput}
      spellCheck="true"
    />
  );
};