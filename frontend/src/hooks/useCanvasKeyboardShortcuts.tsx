import { useEffect } from 'react';
import { useAppState } from '../state/AppStateContext';
import { webSocketClient } from '../api/websocket_client';

interface ToolControls {
  cancelDrawing: () => void;
  cancelPen: () => void;
  confirmPen: () => void;
}

export const useCanvasKeyboardShortcuts = (
  isDrawing: boolean, 
  isPenDrawing: boolean,
  isEditingPath: boolean,
  isEditingText: boolean,
  toolControls: ToolControls
) => {
  const { state, dispatch } = useAppState();
  const { selectedElementIds, groupEditingId } = state;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isTyping = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';

      // 1. Delete selected elements
      if ((e.key === 'Backspace' || e.key === 'Delete') && !isTyping && selectedElementIds.length > 0) {
        e.preventDefault();
        selectedElementIds.forEach(id => webSocketClient.sendDeleteElement(id));
        return;
      }
      
      // Do not process other shortcuts if user is typing in an input field
      if (isTyping) return;

      // 2. Escape key logic
      if (e.key === 'Escape') {
        if (isDrawing) toolControls.cancelDrawing();
        else if (isPenDrawing) toolControls.cancelPen();
        else if (isEditingPath) dispatch({ type: 'SET_EDITING_ELEMENT_ID', payload: { id: null } });
        else if (isEditingText) dispatch({ type: 'SET_EDITING_ELEMENT_ID', payload: { id: null } });
        else if (groupEditingId) dispatch({ type: 'EXIT_GROUP_EDITING' });
      }

      // 3. Enter key for Pen tool
      if (e.key === 'Enter' && isPenDrawing) {
        toolControls.confirmPen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [dispatch, selectedElementIds, isDrawing, isPenDrawing, isEditingPath, isEditingText, groupEditingId, toolControls]);
};