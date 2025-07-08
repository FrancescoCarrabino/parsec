// parsec-frontend/src/hooks/usePanAndZoom.tsx

import { useState, useEffect, useRef } from 'react';
import { KonvaEventObject } from 'konva/lib/Node';

export const usePanAndZoom = () => {
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  
  // Use refs to store pan start info without causing re-renders
  const panStartPos = useRef({ x: 0, y: 0 });
  const panStartStagePos = useRef({ x: 0, y: 0 });

  // --- MOUSE/TRACKPAD WHEEL HANDLER (ZOOM + PAN) ---
  // This is now the standard way to handle modern inputs.
  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;

    // If Ctrl key is pressed, zoom. Otherwise, pan.
    if (e.evt.ctrlKey) {
      // --- ZOOM LOGIC ---
      const scaleBy = 1.1;
      const oldScale = stage.scaleX();
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const mousePointTo = {
        x: (pointer.x - stage.x()) / oldScale,
        y: (pointer.y - stage.y()) / oldScale,
      };

      const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
      
      setStageScale(newScale);
      setStagePos({
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      });
    } else {
      // --- PAN LOGIC (for trackpads/mice with horizontal scroll) ---
      const dx = e.evt.deltaX;
      const dy = e.evt.deltaY;
      setStagePos(prev => ({
        x: prev.x - dx,
        y: prev.y - dy,
      }));
    }
  };

  // --- DRAG-PANNING (Middle Mouse & Spacebar) ---
  // We implement this manually instead of using Konva's `draggable`.

  const panOnMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    const isPanTrigger = e.evt.button === 1; // Middle Mouse
    if (isPanTrigger) {
      e.evt.preventDefault();
      setIsPanning(true);
      const pointer = e.target.getStage()?.getPointerPosition();
      if (pointer) {
        panStartPos.current = pointer;
        panStartStagePos.current = stagePos;
      }
    }
  };

  const panOnMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    if (!isPanning) return;
    
    const stage = e.target.getStage();
    if (!stage) return;
    
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const dx = pointer.x - panStartPos.current.x;
    const dy = pointer.y - panStartPos.current.y;
    
    setStagePos({
      x: panStartStagePos.current.x + dx,
      y: panStartStagePos.current.y + dy,
    });
  };

  const panOnMouseUp = (e: KonvaEventObject<MouseEvent>) => {
    if (e.evt.button === 1 || isPanning) { // Stop if middle mouse released or if space-panning
      setIsPanning(false);
    }
  };
  
  // --- SPACEBAR PANNING & CURSOR EFFECT ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' && !isPanning) {
        const isTyping = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
        if (isTyping) return;
        e.preventDefault();
        setIsPanning(true);
        // For spacebar, we don't have a mouse event to get the start pos,
        // so we have to handle it slightly differently or assume it starts on next mouse move.
        // The current implementation will work fine as panOnMouseMove handles it.
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        setIsPanning(false);
      }
    };

    if (isPanning) {
      document.body.style.cursor = 'grabbing';
    } else {
      document.body.style.cursor = 'default';
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      document.body.style.cursor = 'default';
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup',handleKeyUp);
    };
  }, [isPanning]);


  return { stagePos, stageScale, isPanning, handleWheel, panOnMouseDown, panOnMouseMove, panOnMouseUp };
};