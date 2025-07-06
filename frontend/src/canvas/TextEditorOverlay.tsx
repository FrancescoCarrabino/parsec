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

  useEffect(() => {
    if (editingText && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [editingText]);

  if (!editingText || !stageRef.current) {
    return null;
  }

  const finishEditing = () => {
    if (!editingText || !textareaRef.current) return;
    const newContent = textareaRef.current.value;
    if (newContent !== editingText.content) {
        webSocketClient.sendElementUpdate({ id: editingText.id, content: newContent });
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

  const getStyle = (): React.CSSProperties => {
    const stage = stageRef.current;
    if (!stage) return { display: 'none' };

    const konvaNode = stage.findOne('#' + editingText.id) as Konva.Text;
    if (!konvaNode) return { display: 'none' };

    const textPosition = konvaNode.getAbsolutePosition();
    const stageContainer = stage.container();

    const areaPosition = {
      x: stageContainer.offsetLeft + textPosition.x,
      y: stageContainer.offsetTop + textPosition.y,
    };

    // Calculate font size based on stage scale
    const computedFontSize = konvaNode.fontSize() * stage.scaleX();
    const computedFontWeight = konvaNode.getAttr('fontWeight') || editingText.fontWeight; // Get fontWeight property
    const computedLineHeight = konvaNode.lineHeight() || editingText.lineHeight;
    const computedLetterSpacing = konvaNode.letterSpacing() || editingText.letterSpacing;
    const computedAlign = konvaNode.align() || editingText.align;

    // Fetch the actual font color from the element's data
    const computedFontColor = editingText.fontColor; 

    return {
      position: 'absolute',
      top: `${areaPosition.y}px`,
      left: `${areaPosition.x}px`,
      width: `${konvaNode.width() * stage.scaleX()}px`,
      minHeight: `${(konvaNode.height() * stage.scaleX()) + 20}px`, 
      padding: `${konvaNode.padding() || 0}px`, 
      
      // Apply the fetched and corrected properties
      fontSize: `${computedFontSize}px`,
      fontFamily: `${konvaNode.fontFamily() || editingText.fontFamily}, inherit`, // Best effort for font family
      fontStyle: computedFontWeight, // Directly set fontWeight
      lineHeight: computedLineHeight,
      letterSpacing: `${computedLetterSpacing}px`, // Ensure letter spacing is a string with units
      color: computedFontColor || 'var(--text-primary)', // Use element's fontColor or fallback
      textAlign: computedAlign as 'left' | 'center' | 'right' || 'left',
      
      transformOrigin: 'top left',
      transform: `rotate(${konvaNode.rotation()}deg) scale(${stage.scaleX()}, ${stage.scaleY()})`,
    };
};

  return (
    <div className={styles.overlayContainer}> {/* Added container div */}
      <textarea
        ref={textareaRef}
        className={styles.textarea}
        style={getStyle()}
        defaultValue={editingText.content}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        spellCheck="true"
      />
    </div>
  );
};