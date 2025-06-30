import React, { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Transformer, Group as KonvaGroup, Rect } from 'react-konva';
import Konva from 'konva';
import { KonvaEventObject } from 'konva/lib/Node';
import { useAppState } from '../state/AppStateContext';
import { ElementRenderer } from './elements/ElementRenderer';
import { webSocketClient } from '../api/websocket_client';
import type { CanvasElement } from '../state/types';
import { Vector2d } from 'konva/lib/types';

export const Canvas = () => {
  const { state, dispatch } = useAppState();
  const { elements, selectedElementIds, groupEditingId, activeTool } = state;

  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);
  const [isPanning, setIsPanning] = useState(false);

  const [isDrawing, setIsDrawing] = useState(false);
  const [newRect, setNewRect] = useState<{ x: number, y: number, width: number, height: number } | null>(null);
  const drawingStartPos = useRef<Vector2d>({ x: 0, y: 0 });

  const transformerRef = useRef<Konva.Transformer>(null);
  const stageRef = useRef<Konva.Stage>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (stage?.container()) {
      if (isPanning) stage.container().style.cursor = 'grab';
      else if (activeTool === 'rectangle') stage.container().style.cursor = 'crosshair';
      else stage.container().style.cursor = 'default';
    }
  }, [isPanning, activeTool]);

  useEffect(() => {
    const handlePanningKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isTyping = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA';
      if (e.key === ' ' && !isTyping) { e.preventDefault(); setIsPanning(true); }
    };
    const handlePanningKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') { e.preventDefault(); setIsPanning(false); }
    };
    window.addEventListener('keydown', handlePanningKeyDown);
    window.addEventListener('keyup', handlePanningKeyUp);
    return () => { window.removeEventListener('keydown', handlePanningKeyDown); window.removeEventListener('keyup', handlePanningKeyUp); };
  }, []);

  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;
    const selectedNodes = selectedElementIds.map(id => stageRef.current!.findOne(`#${id}`)).filter((node): node is Konva.Node => !!node);
    transformerRef.current.nodes(selectedNodes);
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedElementIds]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && groupEditingId) dispatch({ type: 'EXIT_GROUP_EDITING' });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch, groupEditingId]);

  const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (isPanning || activeTool !== 'rectangle' || e.target !== stageRef.current) return;
    setIsDrawing(true);
    const pos = e.target.getStage()?.getRelativePointerPosition();
    if (!pos) return;
    drawingStartPos.current = pos;
    setNewRect({ x: pos.x, y: pos.y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    if (!isDrawing || activeTool !== 'rectangle') return;
    const stage = e.target.getStage();
    const pos = stage?.getRelativePointerPosition();
    if (!pos) return;
    setNewRect({
      x: Math.min(drawingStartPos.current.x, pos.x),
      y: Math.min(drawingStartPos.current.y, pos.y),
      width: Math.abs(pos.x - drawingStartPos.current.x),
      height: Math.abs(pos.y - drawingStartPos.current.y),
    });
  };

  const handleMouseUp = (e: KonvaEventObject<MouseEvent>) => {
    setIsDrawing(false);
    if (activeTool === 'rectangle' && newRect && (newRect.width > 5 || newRect.height > 5)) {

      // --- THIS IS THE FIX ---
      // We are no longer sending a text prompt to the AI.
      // We construct the new element's data directly and send a specific command.
      const newElementData = {
        element_type: 'shape',
        shape_type: 'rectangle',
        x: newRect.x,
        y: newRect.y,
        width: newRect.width,
        height: newRect.height,
        fill: { type: 'solid', color: '#cccccc' }, // Default solid fill
      };

      webSocketClient.sendCreateElement(newElementData);
      // -----------------------

      // Switch back to the select tool after drawing.
      dispatch({ type: "SET_ACTIVE_TOOL", payload: { tool: "select" } });
    }
    setNewRect(null);
  };

  const handleSelection = (e: KonvaEventObject<MouseEvent>) => {
    if (activeTool !== 'select') return;
    const target = e.target;
    if (target === stageRef.current) {
      if (groupEditingId) dispatch({ type: 'EXIT_GROUP_EDITING' });
      else dispatch({ type: 'SET_SELECTION', payload: { ids: [] } });
      return;
    }
    const id = target.id(); const element = elements[id]; if (!element) return;
    const idToSelect = (element.parentId && !groupEditingId) ? element.parentId : id;
    const isShiftPressed = e.evt.shiftKey; const isSelected = selectedElementIds.includes(idToSelect);
    if (groupEditingId) { if (element.parentId === groupEditingId) dispatch({ type: 'SET_SELECTION', payload: { ids: [id] } }); return; }
    if (isShiftPressed) { if (isSelected) dispatch({ type: 'REMOVE_FROM_SELECTION', payload: { id: idToSelect } }); else dispatch({ type: 'ADD_TO_SELECTION', payload: { id: idToSelect } }); }
    else { dispatch({ type: 'SET_SELECTION', payload: { ids: [idToSelect] } }); }
  };


  const handleStageDblClick = (e: KonvaEventObject<MouseEvent>) => {
    const target = e.target;
    if (target === stageRef.current) return;
    const id = target.id();
    const element = elements[id];
    if (element && element.parentId) {
      dispatch({ type: 'ENTER_GROUP_EDITING', payload: { groupId: element.parentId, elementId: element.id } });
    }
  };

  // This is the function with the critical fix.
  const handleElementDragEnd = (e: KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true; // Stop the event from bubbling to the Stage

    const id = e.target.id();
    const element = elements[id];
    if (!element) return;

    const updatePayload = { id, x: e.target.x(), y: e.target.y() };

    // --- THIS IS THE FIX ---
    // DO NOT dispatch a local update. This creates a feedback loop.
    // The backend is the single source of truth. Send the update and wait
    // for the broadcasted message to trigger the reducer.
    // REMOVED: dispatch({ type: 'ELEMENT_UPDATED', payload: { ...element, ...updatePayload } });

    webSocketClient.sendElementUpdate(updatePayload);
    // ----------------------
  };

  const handleTransformEnd = (e: KonvaEventObject<Event>) => {
    // This function also needs the same fix to prevent feedback loops.
    e.cancelBubble = true;
    const node = e.target;
    const id = node.id();
    const element = elements[id];
    if (!element) return;

    const scaleX = node.scaleX(); const scaleY = node.scaleY();
    node.scaleX(1); node.scaleY(1);

    const updatePayload = {
      ...element, x: node.x(), y: node.y(), rotation: Math.round(node.rotation()),
      width: Math.max(5, (element.width || 0) * scaleX), height: Math.max(5, (element.height || 0) * scaleY),
    };
    // REMOVED: dispatch({ type: 'ELEMENT_UPDATED', payload: updatePayload });
    webSocketClient.sendElementUpdate(updatePayload);
  };

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current; if (!stage) return;
    const scaleBy = 1.1; const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition(); if (!pointer) return;
    const mousePointTo = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale };
    const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
    setStageScale(newScale);
    const newPos = { x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale };
    setStagePos(newPos);
  };

  const renderElements = (elementList: CanvasElement[]): React.ReactNode[] => {
    return elementList.map(element => {
      if (element.element_type === 'group') {
        const children = Object.values(elements).filter(el => el.parentId === element.id).sort((a, b) => a.zIndex - b.zIndex);
        return (<KonvaGroup key={element.id} id={element.id} x={element.x} y={element.y} rotation={element.rotation} draggable={!groupEditingId} onDragEnd={handleElementDragEnd}>{renderElements(children)}</KonvaGroup>);
      }
      return <ElementRenderer key={element.id} elementId={element.id} onDragEnd={handleElementDragEnd} />;
    });
  };
  const topLevelElements = Object.values(elements).filter(el => !el.parentId && el.isVisible).sort((a, b) => a.zIndex - b.zIndex);

  return (
    <Stage ref={stageRef} width={window.innerWidth - 520} height={window.innerHeight} onClick={handleSelection} onDblClick={handleStageDblClick} onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} scaleX={stageScale} scaleY={stageScale} x={stagePos.x} y={stagePos.y} draggable={isPanning} onDragEnd={(e) => setStagePos(e.target.position())}>
      <Layer>
        {renderElements(topLevelElements)}
        {newRect && <Rect {...newRect} fill="rgba(0, 122, 255, 0.3)" stroke="#007aff" strokeWidth={1} />}
        <Transformer ref={transformerRef} onTransformEnd={handleTransformEnd} boundBoxFunc={(oldBox, newBox) => newBox.width < 5 || newBox.height < 5 ? oldBox : newBox} />
      </Layer>
    </Stage>
  );
};
