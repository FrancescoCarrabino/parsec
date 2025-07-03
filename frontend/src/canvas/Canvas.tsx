// parsec-frontend/src/canvas/Canvas.tsx

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Stage, Layer, Transformer, Group as KonvaGroup, Line } from 'react-konva';
import Konva from 'konva';
import { KonvaEventObject } from 'konva/lib/Node';
import { useAppState } from '../state/AppStateContext';
import { ElementRenderer } from './elements/ElementRenderer';
import { webSocketClient } from '../api/websocket_client';
import type { CanvasElement, TextElement, PathElement } from '../state/types';
import { useDrawingTool } from '../hooks/useDrawingTool';
import { usePenTool } from '../hooks/usePenTool';
import { useMarqueeSelect } from '../hooks/useMarqueeSelect';
import { usePathEditor } from '../hooks/usePathEditor';
import { getGridStyles, GRID_CONFIG } from '../utils/gridUtils'; // <-- Import GRID_CONFIG
import type  { Guide, SnapLine } from '../utils/snapUtils';
import { getElementSnapLines, getGuides, getSnappedPosition } from '../utils/snapUtils';


export const Canvas = () => {
  const { state, dispatch } = useAppState();
  const { elements, selectedElementIds, groupEditingId, activeTool, editingElementId } = state;
  
  // --- No changes to state derivation ---
  const editingTextNode = editingElementId ? state.elements[editingElementId] : null;
  const editingText = (editingTextNode?.element_type === 'text') ? editingTextNode as TextElement : null;
  const editingPathNode = editingElementId ? state.elements[editingElementId] : null;
  const editingPath = (editingPathNode?.element_type === 'path') ? editingPathNode as PathElement : null;

  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const actionInProgress = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  // hooks
  const drawingTool = useDrawingTool(activeTool);
  const penTool = usePenTool(activeTool, stageScale);
  const marqueeTool = useMarqueeSelect(activeTool, isPanning);
  const pathEditor = usePathEditor(editingPath, stageScale);

  //grid
  const gridStyles = getGridStyles(stageScale, stagePos);
  const [guides, setGuides] = useState<Guide[]>([]);
  const staticSnapLines = useRef<{ vertical: any[], horizontal: any[] }>({ vertical: [], horizontal: [] });

  const canvasContainerStyle: React.CSSProperties = {
    flex: 1,
    position: 'relative',
    background: '#333639',
    overflow: 'hidden',
    ...gridStyles,
  };
  

  // Keyboard shortcuts effect
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isTyping = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
      if ((e.key === 'Backspace' || e.key === 'Delete') && !isTyping && selectedElementIds.length > 0) { e.preventDefault(); selectedElementIds.forEach(id => webSocketClient.sendDeleteElement(id)); return; }
      if (isTyping) return;
      if (e.key === ' ' && !penTool.isDrawing && !editingPath) { e.preventDefault(); setIsPanning(true); }
      if (e.key === 'Escape') {
        if (penTool.isDrawing) { penTool.cancel(); }
        // --- REFACTORED: Dispatch actions to exit editing mode ---
        else if (editingPath) { dispatch({ type: 'SET_EDITING_ELEMENT_ID', payload: { id: null } }); }
        else if (editingText) { dispatch({ type: 'SET_EDITING_ELEMENT_ID', payload: { id: null } }); }
        else if (groupEditingId) { dispatch({ type: 'EXIT_GROUP_EDITING' }); }
      }
      if (e.key === 'Enter' && penTool.isDrawing) { penTool.onDblClick(); }
    };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.key === ' ') { e.preventDefault(); setIsPanning(false); } };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [dispatch, groupEditingId, editingText, editingPath, selectedElementIds, penTool]);

  // Transformer effect
  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;
    // --- REFACTORED: Use derived editingText/Path ---
    if (editingText || editingPath) { transformerRef.current.nodes([]); return; }
    const selectedNodes = selectedElementIds.map(id => stageRef.current!.findOne(`.${id}`)).filter((node): node is Konva.Node => !!node);
    transformerRef.current.nodes(selectedNodes);
  }, [selectedElementIds, editingText, editingPath]);

  // Textarea focus effect
  useEffect(() => { if (editingText && textareaRef.current) { textareaRef.current.focus(); } }, [editingText]);

  // HANDLERS

  const handleDragStart = (e: KonvaEventObject<DragEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;

    // Pre-calculate snap lines for all non-dragged elements.
    const staticNodes = stage.find('.element').filter(node => !node.isDragging());
    const lines = { vertical: [] as SnapLine[], horizontal: [] as SnapLine[] };
    staticNodes.forEach(node => {
        const nodeLines = getElementSnapLines(node);
        lines.vertical.push(...nodeLines.vertical);
        lines.horizontal.push(...nodeLines.horizontal);
    });
    staticSnapLines.current = lines;
  };

  const handleDragMove = (e: KonvaEventObject<DragEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;

    const draggedNode = e.target;
    const draggedLines = getElementSnapLines(draggedNode);
    
    // Find smart guides by comparing dragged element to static elements.
    const activeGuides = getGuides(draggedLines, staticSnapLines.current);
    
    // Snap-to-Grid logic
    let finalPos = { x: draggedNode.x(), y: draggedNode.y() };
    const gridSize = GRID_CONFIG.BASE_SIZE; // Use the base grid size for snapping
    
    // If no smart guides are active, try to snap to the grid.
    if (activeGuides.vertical.length === 0) {
        const snappedX = Math.round(draggedNode.x() / gridSize) * gridSize;
        if (Math.abs(snappedX - draggedNode.x()) < 5) {
             finalPos.x = snappedX;
        }
    } else {
        finalPos.x += activeGuides.vertical[0].offset;
    }

    if (activeGuides.horizontal.length === 0) {
        const snappedY = Math.round(draggedNode.y() / gridSize) * gridSize;
        if (Math.abs(snappedY - draggedNode.y()) < 5) {
            finalPos.y = snappedY;
        }
    } else {
        finalPos.y += activeGuides.horizontal[0].offset;
    }

    draggedNode.position(finalPos);
    setGuides([...activeGuides.vertical, ...activeGuides.horizontal]);
  };

  const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
    // Send the final, snapped position to the backend.
    webSocketClient.sendElementUpdate({ 
        id: e.target.id(), 
        x: e.target.x(), 
        y: e.target.y() 
    });
    // Clear the visual guides.
    setGuides([]);
  };

  // The old, simple drag end handler. We keep it for elements where we don't apply snapping (inside groups).
  const handleSimpleDragEnd = (e: KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    webSocketClient.sendElementUpdate({ id: e.target.id(), x: e.target.x(), y: e.target.y() });
  };
  const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    // Handle the "click-to-create" Text tool first.
    if (activeTool === 'text') {
      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getRelativePointerPosition();
      if (!pos) return;

      // Create the payload for a new text element at the clicked position.
      const newTextPayload = {
        element_type: 'text',
        x: pos.x,
        y: pos.y,
        content: "Type something...",
        // You can add other defaults here if needed
      };

      // Send the creation command to the backend.
      webSocketClient.sendCreateElement(newTextPayload);

      // For a better UX, switch back to the select tool immediately after creation.
      dispatch({ type: 'SET_ACTIVE_TOOL', payload: { tool: 'select' } });

      // Prevent other tool handlers from running.
      return;
    }

    // Original logic for other tools
    actionInProgress.current = true;
    if (marqueeTool.onMouseDown(e)) return;
    if (drawingTool.onMouseDown(e)) return;
    if (penTool.onMouseDown(e)) return;
  };

  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    marqueeTool.onMouseMove(e);
    drawingTool.onMouseMove(e);
    penTool.onMouseMove(e);
  };

  const handleMouseUp = (e: KonvaEventObject<MouseEvent>) => {
    marqueeTool.onMouseUp(e);
    drawingTool.onMouseUp();
    setTimeout(() => { actionInProgress.current = false; }, 50);
  };

  const handleClick = (e: KonvaEventObject<MouseEvent>) => {
    if (actionInProgress.current) return;
    if (activeTool !== 'select' || editingText || editingPath || penTool.isDrawing) return;
    const target = e.target;
    if (target === stageRef.current) { dispatch({ type: 'SET_SELECTION', payload: { ids: [] } }); return; }
    const id = target.id(); const element = elements[id]; if (!element) return;
    const idToSelect = (element.parentId && !groupEditingId) ? element.parentId : id;
    if (e.evt.shiftKey) {
      if (selectedElementIds.includes(idToSelect)) dispatch({ type: 'REMOVE_FROM_SELECTION', payload: { id: idToSelect } });
      else dispatch({ type: 'ADD_TO_SELECTION', payload: { id: idToSelect } });
    } else { dispatch({ type: 'SET_SELECTION', payload: { ids: [idToSelect] } }); }
  };

  const handleDblClick = (e: KonvaEventObject<MouseEvent>) => {
    if (penTool.onDblClick()) return;
    const node = e.target; if (node === stageRef.current) return;
    const element = elements[node.id()]; if (!element) return;
    // --- REFACTORED: Dispatch actions to enter editing mode ---
    if (element.element_type === 'text') { dispatch({ type: 'SET_EDITING_ELEMENT_ID', payload: { id: element.id } }); }
    else if (element.element_type === 'path') { dispatch({ type: 'SET_EDITING_ELEMENT_ID', payload: { id: element.id } }); }
    else if (element.parentId && ['group', 'frame'].includes(elements[element.parentId]?.element_type) && !editingPath) {
      dispatch({ type: 'ENTER_GROUP_EDITING', payload: { groupId: element.parentId, elementId: element.id } });
    }
  };

  const finishEditingText = () => {
    if (!editingText || !textareaRef.current) return;
    webSocketClient.sendElementUpdate({ id: editingText.id, content: textareaRef.current.value });
    // --- REFACTORED: Dispatch action to exit editing mode ---
    dispatch({ type: 'SET_EDITING_ELEMENT_ID', payload: { id: null } });
  };
  const handleTextareaBlur = () => { finishEditingText(); };
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finishEditingText(); }
    if (e.key === 'Escape') { dispatch({ type: 'SET_EDITING_ELEMENT_ID', payload: { id: null } }); }
  };

  const handleElementDragEnd = (e: KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    webSocketClient.sendElementUpdate({ id: e.target.id(), x: e.target.x(), y: e.target.y() });
  };

  const handleTransformEnd = (e: KonvaEventObject<Event>) => {
    const node = e.target; const element = elements[node.id()]; if (!element) return;
    const scaleX = node.scaleX(); const scaleY = node.scaleY();
    node.scaleX(1); node.scaleY(1);
    const updatePayload: any = { id: element.id, x: node.x(), y: node.y(), rotation: Math.round(node.rotation()), width: Math.max(5, element.width * scaleX), height: Math.max(5, element.height * scaleY) };
    if (element.element_type === 'path') {
      updatePayload.points = element.points.map(p => ({ ...p, x: p.x * scaleX, y: p.y * scaleY, handleIn: p.handleIn ? { x: p.handleIn.x * scaleX, y: p.handleIn.y * scaleY } : undefined, handleOut: p.handleOut ? { x: p.handleOut.x * scaleX, y: p.handleOut.y * scaleY } : undefined }));
    }
    webSocketClient.sendElementUpdate(updatePayload);
  };

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => { e.evt.preventDefault(); const stage = stageRef.current; if (!stage) return; const scaleBy = 1.1; const oldScale = stage.scaleX(); const pointer = stage.getPointerPosition(); if (!pointer) return; const mousePointTo = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale }; const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy; setStageScale(newScale); setStagePos({ x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale }); };

  const getEditingTextareaStyle = (): React.CSSProperties => {
    // We still use the derived editingText object to know *if* we are editing.
    if (!editingText) return { display: 'none' };

    const stage = stageRef.current;
    if (!stage) return { display: 'none' };

    // Actively find the Konva node on the canvas using its ID.
    // The '#' makes it an efficient ID selector.
    const node = stage.findOne('#' + editingText.id) as Konva.Text;

    // If the node isn't found for any reason (e.g., timing), prevent a crash.
    if (!node) return { display: 'none' };

    // The rest of the logic can now proceed safely with the found node.
    const textPosition = node.getAbsolutePosition();
    const areaPosition = {
      x: stage.container().offsetLeft + textPosition.x,
      y: stage.container().offsetTop + textPosition.y,
    };

    return {
      position: 'absolute',
      top: `${areaPosition.y}px`,
      left: `${areaPosition.x}px`,
      width: `${node.width() * stage.scaleX()}px`,
      height: `${node.height() * stage.scaleX() + 10}px`,
      fontSize: `${node.fontSize() * stage.scaleY()}px`,
      fontFamily: node.fontFamily(),
      lineHeight: node.lineHeight(),
      padding: '0px',
      margin: '0px',
      border: '1px solid #007aff',
      background: 'rgba(255, 255, 255, 0.9)',
      outline: 'none',
      resize: 'none',
      overflow: 'hidden',
      color: node.fill(),
      textAlign: node.align() as 'left' | 'center' | 'right',
      transformOrigin: 'top left',
      transform: `rotate(${node.rotation()}deg)`,
    };
  };
  const renderElements = (elementList: CanvasElement[]): React.ReactNode[] => {
    return elementList.map(element => {
        // --- GROUP / FRAME LOGIC ---
        if (element.element_type === 'group' || element.element_type === 'frame') {
            const children = Object.values(elements).filter(el => el.parentId === element.id).sort((a, b) => a.zIndex - b.zIndex);
            const isGroupDraggable = !element.parentId || (groupEditingId === element.parentId);
            const clipFunc = (element.element_type === 'frame' && element.clipsContent) ? (ctx: Konva.Context) => { ctx.rect(0, 0, element.width, element.height); } : undefined;
            return (
                <KonvaGroup
                    key={element.id} id={element.id} name={`${element.id} element`}
                    x={element.x} y={element.y} rotation={element.rotation}
                    draggable={isGroupDraggable}
                    // Groups and Frames get the full snapping handlers
                    onDragStart={handleDragStart}
                    onDragMove={handleDragMove}
                    onDragEnd={handleDragEnd}
                    clipFunc={clipFunc}
                    onDblClick={handleDblClick}
                >
                    {/* The frame's background itself is not draggable */}
                    <ElementRenderer
                        elementId={element.id}
                        isVisible={true}
                        onDblClick={handleDblClick}
                        onDragStart={() => {}} // No-op for non-draggable part
                        onDragMove={() => {}}  // No-op
                        onDragEnd={() => {}}    // No-op
                    />
                    {/* The children inside the group are rendered recursively */}
                    {renderElements(children)}
                </KonvaGroup>
            );
        }

        // --- TOP-LEVEL ELEMENT LOGIC ---
        const isVisible = editingElementId !== element.id;
        // Top-level elements also get the full snapping handlers
        return (
            <ElementRenderer
                key={element.id}
                elementId={element.id}
                isVisible={isVisible}
                onDblClick={handleDblClick}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
            />
        );
    });
};
const topLevelElements = Object.values(elements).filter(el => !el.parentId).sort((a, b) => a.zIndex - b.zIndex);

return (
  <div style={canvasContainerStyle}>
    <Stage ref={stageRef} onDblClick={handleDblClick} onClick={handleClick} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onWheel={handleWheel} width={window.innerWidth - 520} height={window.innerHeight} scaleX={stageScale} scaleY={stageScale} x={stagePos.x} y={stagePos.y} draggable={isPanning}>
      <Layer>
        {renderElements(topLevelElements)}
        {drawingTool.preview}
        {marqueeTool.preview}
        {penTool.preview}
        {pathEditor.editUI}
        <Transformer ref={transformerRef} onTransformEnd={handleTransformEnd} boundBoxFunc={(oldBox, newBox) => newBox.width < 5 || newBox.height < 5 ? oldBox : newBox} ignoreStroke={true} />
      </Layer>
      <Layer name="guides-layer">
          {guides.map((guide, i) => ( <Line key={i} points={guide.line} stroke="#FF0000" strokeWidth={1/stageScale} dash={[4, 6]} listening={false} /> ))}
      </Layer>
    </Stage>
    {editingText && ( <textarea ref={textareaRef} style={getEditingTextareaStyle()} defaultValue={editingText.content} onBlur={handleTextareaBlur} onKeyDown={handleTextareaKeyDown} /> )}
  </div>
);
};