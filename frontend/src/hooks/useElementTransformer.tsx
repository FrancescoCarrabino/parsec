import React, { useState, useRef, useEffect } from 'react';
import Konva from 'konva';
import { KonvaEventObject } from 'konva/lib/Node';
import { useAppState } from '../state/AppStateContext';
import { webSocketClient } from '../api/websocket_client';
import { 
  getElementSnapLines, 
  getStageSnapLines, 
  findBestSnapGuides, 
  applyTransformSnap 
} from '../utils/snapUtils';
import type { Guide, SnapLine } from '../utils/snapUtils';

interface UseElementTransformerProps {
  stageRef: React.RefObject<Konva.Stage>;
  transformerRef: React.RefObject<Konva.Transformer>;
  isEditing: boolean; // True if text editing, path editing, or drawing is active
}

type SnapLines = { vertical: SnapLine[], horizontal: SnapLine[] };

export const useElementTransformer = ({ stageRef, transformerRef, isEditing }: UseElementTransformerProps) => {
  const { state } = useAppState();
  const { elements, selectedElementIds } = state;

  const [guides, setGuides] = useState<Guide[]>([]);
  const elementSnapLines = useRef<SnapLines>({ vertical: [], horizontal: [] });
  const stageSnapLines = useRef<SnapLines>({ vertical: [], horizontal: [] });

  // No need to read stageScale here, we'll get it fresh from the ref when needed.

  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;
    
    if (isEditing) {
      transformerRef.current.nodes([]);
      return;
    }

    const selectedNodes = selectedElementIds
      .map(id => stageRef.current!.findOne(`.${id}`))
      .filter((node): node is Konva.Node => !!node);
      
    transformerRef.current.nodes(selectedNodes);
  }, [selectedElementIds, isEditing, stageRef, transformerRef]);

  const prepareStaticSnapLines = () => {
    const stage = stageRef.current;
    if (!stage) return;

    const elementLines: SnapLines = { vertical: [], horizontal: [] };
    stage.find('.element')
      .filter(node => !selectedElementIds.includes(node.id()))
      .forEach(node => {
        const nodeLines = getElementSnapLines(node);
        elementLines.vertical.push(...nodeLines.vertical);
        elementLines.horizontal.push(...nodeLines.horizontal);
      });
    elementSnapLines.current = elementLines;
      
    stageSnapLines.current = getStageSnapLines(stage);
  };

  const getPrioritizedGuides = (draggedLines: SnapLines) => {
    let bestSnaps = findBestSnapGuides(draggedLines, elementSnapLines.current);

    if (!bestSnaps.vertical) {
      const stageVerticalSnap = findBestSnapGuides(draggedLines, { vertical: stageSnapLines.current.vertical, horizontal: [] });
      if (stageVerticalSnap.vertical) bestSnaps.vertical = stageVerticalSnap.vertical;
    }

    if (!bestSnaps.horizontal) {
      const stageHorizontalSnap = findBestSnapGuides(draggedLines, { vertical: [], horizontal: stageSnapLines.current.horizontal });
      if (stageHorizontalSnap.horizontal) bestSnaps.horizontal = stageHorizontalSnap.horizontal;
    }
    
    return bestSnaps;
  }
  
  /**
   * NEW: This function takes absolute screen-space guides and converts their
   * line coordinates to the stage's local space for correct rendering.
   */
  const setTransformedGuides = (activeGuides: Guide[]) => {
    const stage = stageRef.current;
    if (!stage || activeGuides.length === 0) {
      setGuides([]);
      return;
    }

    // Get the stage's transformation matrix and invert it
    const transform = stage.getAbsoluteTransform().copy().invert();

    const transformedGuides = activeGuides.map(guide => {
      const [x1, y1, x2, y2] = guide.line;
      // Transform the start and end points of the line
      const p1 = transform.point({ x: x1, y: y1 });
      const p2 = transform.point({ x: x2, y: y2 });
      return {
        ...guide,
        line: [p1.x, p1.y, p2.x, p2.y],
      };
    });

    setGuides(transformedGuides);
  };


  const handleInteractionStart = () => {
    prepareStaticSnapLines();
  };

  const handleDragMove = (e: KonvaEventObject<DragEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;

    const draggedNode = e.target;
    const draggedLines = getElementSnapLines(draggedNode);
    const bestSnaps = getPrioritizedGuides(draggedLines);
    
    const stageScale = stage.scaleX();
    let finalPos = { x: draggedNode.x(), y: draggedNode.y() };
    
    if (bestSnaps.vertical) { finalPos.x += bestSnaps.vertical.offset / stageScale; }
    if (bestSnaps.horizontal) { finalPos.y += bestSnaps.horizontal.offset / stageScale; }
    
    draggedNode.position(finalPos);
    
    const activeGuides = [bestSnaps.vertical, bestSnaps.horizontal].filter((g): g is Guide => !!g);
    setTransformedGuides(activeGuides); // Use the new function to set guides
    
    webSocketClient.sendElementUpdate({ id: draggedNode.id(), x: finalPos.x, y: finalPos.y }, false);
  };

  const handleTransform = (e: KonvaEventObject<Event>) => {
    const stage = stageRef.current;
    const tr = transformerRef.current;
    if (!stage || !tr) return;

    const node = e.target;
    node.setAttrs({
        width: node.width() * node.scaleX(),
        height: node.height() * node.scaleY(),
        scaleX: 1,
        scaleY: 1,
    });

    const transformingLines = getElementSnapLines(node);
    const bestSnaps = getPrioritizedGuides(transformingLines);
    
    applyTransformSnap(node, tr, bestSnaps, stage.scaleX());
    
    const activeGuides = [bestSnaps.vertical, bestSnaps.horizontal].filter((g): g is Guide => !!g);
    setTransformedGuides(activeGuides); // Use the new function to set guides
  };

  const handleInteractionEnd = (e: KonvaEventObject<Event | DragEvent>) => {
    setGuides([]);
    const node = e.target;
    const updatePayload = {
        id: node.id(),
        x: node.x(),
        y: node.y(),
        rotation: Math.round(node.rotation()),
        // On transformEnd, width/height might still have scale applied if not reset in the last `transform` event
        width: node.width() * node.scaleX(),
        height: node.height() * node.scaleY(),
    };
    webSocketClient.sendElementUpdate(updatePayload, true);
  };

  // Consolidate handlers for clarity
  const dragHandlers = { onDragStart: handleInteractionStart, onDragMove: handleDragMove, onDragEnd: handleInteractionEnd };
  const transformHandlers = { onTransformStart: handleInteractionStart, onTransform: handleTransform, onTransformEnd: handleInteractionEnd };

  return { guides, dragHandlers, transformHandlers };
};