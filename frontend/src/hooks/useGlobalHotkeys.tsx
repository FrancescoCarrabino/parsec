import { useEffect } from 'react';
import { nanoid } from 'nanoid';
import { useAppState } from '../state/AppStateContext';
import { webSocketClient } from '../api/websocket_client';
import type { CanvasElement } from '../state/types';

// In-memory clipboard
let clipboard: CanvasElement[] = [];

export const useGlobalHotkeys = () => {
  const { state, dispatch } = useAppState();
  const { elements, selectedElementIds } = state;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
            return;
        }

        const isUndo = (e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey;
        const isRedo = (e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey));
        const isCopy = (e.ctrlKey || e.metaKey) && e.key === 'c';
        const isPaste = (e.ctrlKey || e.metaKey) && e.key === 'v';

        if (isUndo) {
            e.preventDefault();
            webSocketClient.sendUndo();
        } else if (isRedo) {
            e.preventDefault();
            webSocketClient.sendRedo();
        } else if (isCopy) {
            e.preventDefault();
            if (selectedElementIds.length > 0) {
                clipboard = selectedElementIds
                    .map(id => elements[id])
                    .filter(Boolean)
                    .map(el => JSON.parse(JSON.stringify(el)));
            }
        } else if (isPaste) {
            e.preventDefault();
            if (clipboard.length > 0) {
                const newElements = clipboard.map(el => ({
                    ...el,
                    id: `${el.element_type}_${nanoid(8)}`,
                    x: el.x + 20,
                    y: el.y + 20,
                }));
                webSocketClient.sendCreateElementsBatch(newElements);
            }
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedElementIds, elements, dispatch]); // Dispatch is stable but good practice to include
};