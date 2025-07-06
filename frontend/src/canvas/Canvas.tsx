// parsec-frontend/src/canvas/Canvas.tsx

import React, { useEffect, useRef, useState, useReducer } from 'react';
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
import { getGridStyles, GRID_CONFIG } from '../utils/gridUtils';
import type { Guide, SnapLine } from '../utils/snapUtils';
import { getElementSnapLines, getGuides } from '../utils/snapUtils';

export const Canvas = () => {
  const { state, dispatch } = useAppState();
  const { elements, selectedElementIds, groupEditingId, activeTool, editingElementId, componentDefinitions } = state;
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

  const [, forceUpdate] = useReducer(x => x + 1, 0);

  const drawingTool = useDrawingTool(forceUpdate);
  const penTool = usePenTool(forceUpdate);

  const marqueeTool = useMarqueeSelect(activeTool, isPanning, stageScale);
  const pathEditor = usePathEditor(editingPath, stageScale);

  const gridStyles = getGridStyles(stageScale, stagePos);
  const [guides, setGuides] = useState<Guide[]>([]);
  const staticSnapLines = useRef<{ vertical: SnapLine[], horizontal: SnapLine[] }>({ vertical: [], horizontal: [] });
  const canvasContainerStyle: React.CSSProperties = { flex: 1, position: 'relative', background: '#333639', overflow: 'hidden', ...gridStyles, };

  const isDrawing = drawingTool.isDrawing || penTool.isDrawing;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isTyping = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
      if ((e.key === 'Backspace' || e.key === 'Delete') && !isTyping && selectedElementIds.length > 0) { e.preventDefault(); selectedElementIds.forEach(id => webSocketClient.sendDeleteElement(id)); return; }
      if (isTyping) return;
      if (e.key === ' ' && !isDrawing && !editingPath) { e.preventDefault(); setIsPanning(true); }
      if (e.key === 'Escape') {
        if (drawingTool.isDrawing) drawingTool.cancel();
        if (penTool.isDrawing) penTool.cancel();
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
  }, [dispatch, groupEditingId, editingText, editingPath, selectedElementIds, penTool, drawingTool, isDrawing]);

  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;
    if (editingText || editingPath || isDrawing) { transformerRef.current.nodes([]); return; }
    const selectedNodes = selectedElementIds.map(id => stageRef.current!.findOne(`.${id}`)).filter((node): node is Konva.Node => !!node);
    transformerRef.current.nodes(selectedNodes);
  }, [selectedElementIds, editingText, editingPath, isDrawing]);

  useEffect(() => { if (editingText && textareaRef.current) { textareaRef.current.focus(); } }, [editingText]);

  const prepareStaticSnapLines = () => {
      const stage = stageRef.current;
      if (!stage) return;
      const staticNodes = stage.find('.element').filter(node => !selectedElementIds.includes(node.id()));
      const lines = { vertical: [] as SnapLine[], horizontal: [] as SnapLine[] };
      staticNodes.forEach(node => {
          const nodeLines = getElementSnapLines(node);
          lines.vertical.push(...nodeLines.vertical);
          lines.horizontal.push(...nodeLines.horizontal);
      });
      staticSnapLines.current = lines;
  };

  const handleDragStart = (e: KonvaEventObject<DragEvent>) => {
      prepareStaticSnapLines();
  };

  const handleDragMove = (e: KonvaEventObject<DragEvent>) => {
      const draggedNode = e.target;
      const draggedLines = getElementSnapLines(draggedNode);
      const activeGuides = getGuides(draggedLines, staticSnapLines.current);
      let finalPos = { x: draggedNode.x(), y: draggedNode.y() };
      const verticalGuide = activeGuides.vertical.length > 0 ? activeGuides.vertical[0] : null;
      if (verticalGuide) { finalPos.x += verticalGuide.offset; }
      const horizontalGuide = activeGuides.horizontal.length > 0 ? activeGuides.horizontal[0] : null;
      if (horizontalGuide) { finalPos.y += horizontalGuide.offset; }
      draggedNode.position(finalPos);
      setGuides([...activeGuides.vertical, ...activeGuides.horizontal]);
      webSocketClient.sendElementUpdate(
        { id: draggedNode.id(), x: finalPos.x, y: finalPos.y },
        false // do not commit to history
    );
  };

  const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
      webSocketClient.sendElementUpdate(
        { id: e.target.id(), x: e.target.x(), y: e.target.y() },
        true // commit this final state to history
    );
      setGuides([]);
  };

  const handleTransformStart = () => {
      prepareStaticSnapLines();
  };

  const handleTransform = (e: KonvaEventObject<Event>) => {
      const node = e.target;
      node.setAttrs({
          width: node.width() * node.scaleX(),
          height: node.height() * node.scaleY(),
          scaleX: 1,
          scaleY: 1,
      });
      const transformedLines = getElementSnapLines(node);
      const activeGuides = getGuides(transformedLines, staticSnapLines.current);
      if (activeGuides.vertical.length > 0 || activeGuides.horizontal.length > 0) {
          activeGuides.vertical.forEach(guide => {
              const absPos = node.getAbsolutePosition();
              const nodeBox = getElementSnapLines(node);
              const isLeftEdge = Math.abs(nodeBox.vertical[0].value - guide.snap) < 1;
              const isRightEdge = Math.abs(nodeBox.vertical[2].value - guide.snap) < 1;
              if (isLeftEdge) {
                  const dx = guide.snap - absPos.x;
                  const newWidth = node.width() - dx;
                  node.width(newWidth);
                  node.x(node.x() + dx);
              } else if (isRightEdge) {
                  node.width(guide.snap - absPos.x);
              }
          });
          activeGuides.horizontal.forEach(guide => {
              const absPos = node.getAbsolutePosition();
              const nodeBox = getElementSnapLines(node);
              const isTopEdge = Math.abs(nodeBox.horizontal[0].value - guide.snap) < 1;
              const isBottomEdge = Math.abs(nodeBox.horizontal[2].value - guide.snap) < 1;
              if (isTopEdge) {
                  const dy = guide.snap - absPos.y;
                  const newHeight = node.height() - dy;
                  node.height(newHeight);
                  node.y(node.y() + dy);
              } else if (isBottomEdge) {
                  node.height(guide.snap - absPos.y);
              }
          });
      }
      setGuides([...activeGuides.vertical, ...activeGuides.horizontal]);
  };

  const handleTransformEnd = (e: KonvaEventObject<Event>) => {
      const node = e.target;
      const element = elements[node.id()];
      if (!element) return;
      const updatePayload: any = {
          id: element.id, x: node.x(), y: node.y(),
          rotation: Math.round(node.rotation()),
          width: node.width(), height: node.height(),
      };
      webSocketClient.sendElementUpdate(updatePayload);
      setGuides([]);
  };
  
  const handleDblClick = (e: KonvaEventObject<MouseEvent>) => {
    if (penTool.isDrawing) {
        penTool.onDblClick();
        return;
    }
    const node = e.target;
    if (node === stageRef.current) return;
    const element = elements[node.id()];
    if (!element) return;
    if (element.element_type === 'text') {
        dispatch({ type: 'SET_EDITING_ELEMENT_ID', payload: { id: element.id } });
    } else if (element.element_type === 'path') {
        dispatch({ type: 'SET_EDITING_ELEMENT_ID', payload: { id: element.id } });
    } else if (element.parentId && ['group', 'frame'].includes(elements[element.parentId]?.element_type) && !editingPath) {
      dispatch({ type: 'ENTER_GROUP_EDITING', payload: { groupId: element.parentId, elementId: element.id } });
    }
  };

  const finishEditingText = () => {
    if (!editingText || !textareaRef.current) return;
    webSocketClient.sendElementUpdate({ id: editingText.id, content: textareaRef.current.value });
    dispatch({ type: 'SET_EDITING_ELEMENT_ID', payload: { id: null } });
  };
  
  const handleTextareaBlur = () => { finishEditingText(); };
  
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finishEditingText(); }
    if (e.key === 'Escape') { dispatch({ type: 'SET_EDITING_ELEMENT_ID', payload: { id: null } }); }
  };

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => { e.evt.preventDefault(); const stage = stageRef.current; if (!stage) return; const scaleBy = 1.1; const oldScale = stage.scaleX(); const pointer = stage.getPointerPosition(); if (!pointer) return; const mousePointTo = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale }; const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy; setStageScale(newScale); setStagePos({ x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale }); };

  const getEditingTextareaStyle = (): React.CSSProperties => {
    if (!editingText) return { display: 'none' };
    const stage = stageRef.current;
    if (!stage) return { display: 'none' };
    const node = stage.findOne('#' + editingText.id) as Konva.Text;
    if (!node) return { display: 'none' };
    const textPosition = node.getAbsolutePosition();
    const areaPosition = {
      x: stage.container().offsetLeft + textPosition.x,
      y: stage.container().offsetTop + textPosition.y,
    };
    return {
      position: 'absolute', top: `${areaPosition.y}px`, left: `${areaPosition.x}px`,
      width: `${node.width() * stage.scaleX()}px`, height: `${node.height() * stage.scaleX() + 10}px`,
      fontSize: `${node.fontSize() * stage.scaleY()}px`, fontFamily: node.fontFamily(),
      lineHeight: node.lineHeight(), padding: '0px', margin: '0px',
      border: '1px solid #007aff', background: 'rgba(255, 255, 255, 0.9)',
      outline: 'none', resize: 'none', overflow: 'hidden',
      color: node.fill(), textAlign: node.align() as 'left' | 'center' | 'right',
      transformOrigin: 'top left', transform: `rotate(${node.rotation()}deg)`,
    };
  };

  const handleClick = (e: KonvaEventObject<MouseEvent>) => {
    if (actionInProgress.current || isDrawing) return;
    if (activeTool !== 'select') return;
    const target = e.target;
    if (target === stageRef.current) { dispatch({ type: 'SET_SELECTION', payload: { ids: [] } }); return; }
    const id = target.id();
    const element = elements[id];
    if (!element) return;
    const idToSelect = (element.parentId && !groupEditingId) ? element.parentId : id;
    if (e.evt.shiftKey) {
      if (selectedElementIds.includes(idToSelect)) { dispatch({ type: 'REMOVE_FROM_SELECTION', payload: { id: idToSelect } }); }
      else { dispatch({ type: 'ADD_TO_SELECTION', payload: { id: idToSelect } }); }
    } else { dispatch({ type: 'SET_SELECTION', payload: { ids: [idToSelect] } }); }
  };
  
  const renderElements = (elementList: CanvasElement[]): React.ReactNode[] => {
    const dragHandlers = activeTool === 'select'
      ? { onDragStart: handleDragStart, onDragMove: handleDragMove, onDragEnd: handleDragEnd }
      : { onDragStart: () => {}, onDragMove: () => {}, onDragEnd: () => {} };
    return elementList.map(element => {
        if (element.element_type === 'group' || element.element_type === 'frame') {
            const children = Object.values(elements).filter(el => el.parentId === element.id).sort((a, b) => a.zIndex - b.zIndex);
            const isGroupDraggable = (!element.parentId || (groupEditingId === element.parentId)) && activeTool === 'select';
            const clipFunc = (element.element_type === 'frame' && element.clipsContent) ? (ctx: Konva.Context) => { ctx.rect(0, 0, element.width, element.height); } : undefined;
            return (
                <KonvaGroup key={element.id} id={element.id} name={`${element.id} element`} x={element.x} y={element.y} rotation={element.rotation} draggable={isGroupDraggable} {...dragHandlers} clipFunc={clipFunc} onDblClick={handleDblClick}>
                    <ElementRenderer elementId={element.id} isVisible={true} onDblClick={handleDblClick} />
                    {renderElements(children)}
                </KonvaGroup>
            );
        }
        // Draggability for simple elements is handled by the ElementRenderer directly
        // UNLESS we are in group editing mode, then only the group is draggable.
        const isElementDraggable = (!element.parentId || groupEditingId === element.parentId) && activeTool === 'select';
        const elementDragHandlers = isElementDraggable ? dragHandlers : {};
        const isVisible = editingElementId !== element.id;

        return ( <ElementRenderer key={element.id} elementId={element.id} isVisible={isVisible} onDblClick={handleDblClick} {...elementDragHandlers} /> );
    });
  };

  const topLevelElements = Object.values(elements).filter(el => !el.parentId).sort((a, b) => a.zIndex - b.zIndex);
  
  const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    // If we are using the pen tool, it has its own drawing logic.
    if (penTool.isDrawing) {
        penTool.onMouseDown(e);
        return;
    }

    // Handle marquee selection
    if (activeTool === 'select' && e.target === e.target.getStage()) {
        const consumed = marqueeTool.onMouseDown(e);
        // If the marquee tool started a selection, we're done.
        if (consumed) {
             actionInProgress.current = true; // Set the action flag HERE
             return;
        }
    }
    
    // Handle creation tools (rectangle, ellipse)
    // The pen tool is handled separately above.
    if (activeTool !== 'select' && activeTool !== 'pen') {
        const consumed = drawingTool.onMouseDown(e);
        if (consumed) {
            actionInProgress.current = true; // Set the action flag HERE
        }
    }
  };

  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    // This handler is correct and does not need changes.
    drawingTool.onMouseMove(e);
    penTool.onMouseMove(e);
    marqueeTool.onMouseMove(e);
  };

  const handleMouseUp = (e: KonvaEventObject<MouseEvent>) => {
    // Check marquee tool first
    if (marqueeTool.isSelecting) {
        marqueeTool.onMouseUp(e);
    } 
    // Then check drawing tools
    else if (drawingTool.isDrawing) {
        drawingTool.onMouseUp();
    }
    // Pen tool handles its own completion, so no changes needed here.

    // Use a timeout to reset the flag, preventing click events from firing immediately.
    setTimeout(() => { actionInProgress.current = false; }, 50);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); // This is necessary to allow a drop event.
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    // Retrieve the data we stored in the drag event
    const dragDataString = e.dataTransfer.getData('text/plain');
    if (!dragDataString) return;

    let dragData;
    try {
      dragData = JSON.parse(dragDataString);
    } catch (err) {
      console.error("Failed to parse drag data:", err);
      return;
    }

    const { definitionId, offsetX, offsetY } = dragData;
    const definition: ComponentDefinition | undefined = componentDefinitions[definitionId];

    if (!definition) {
      console.error(`Dropped component with unknown definition ID: ${definitionId}`);
      return;
    }

    // Calculate drop position relative to the canvas, accounting for pan and zoom
    const dropPosition = stage.getPointerPosition();
    if (!dropPosition) return;
    
    // The drop position is in world coordinates. We must adjust for the offset
    // of the cursor *within* the dragged item to place it correctly.
    const finalX = dropPosition.x - (offsetX * definition.template_elements[0]?.width || 0) / stageScale;
    const finalY = dropPosition.y - (offsetY * definition.template_elements[0]?.height || 0) / stageScale;

    // Create the payload for the new component instance
    const newInstancePayload = {
      element_type: 'component_instance',
      definition_id: definition.id,
      x: finalX,
      y: finalY,
      width: definition.template_elements.reduce((max, el) => Math.max(max, el.x + el.width), 0),
      height: definition.template_elements.reduce((max, el) => Math.max(max, el.y + el.height), 0),
      // The backend will populate the default properties
    };

    webSocketClient.sendCreateElement(newInstancePayload);
  };


  return (
    // Add the new handlers to the main container div
    <div style={canvasContainerStyle} onDragOver={handleDragOver} onDrop={handleDrop}>
      <Stage ref={stageRef} onDblClick={handleDblClick} onClick={handleClick} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onWheel={handleWheel} width={window.innerWidth - 520} height={window.innerHeight} scaleX={stageScale} scaleY={stageScale} x={stagePos.x} y={stagePos.y} draggable={isPanning}>
        <Layer>
            {renderElements(topLevelElements)}
            {drawingTool.preview}
            {penTool.renderPreview(stageScale)}
            {marqueeTool.preview}
            {pathEditor.editUI}
            <Transformer ref={transformerRef} onTransformStart={handleTransformStart} onTransform={handleTransform} onTransformEnd={handleTransformEnd} boundBoxFunc={(oldBox, newBox) => newBox.width < 5 || newBox.height < 5 ? oldBox : newBox} ignoreStroke={true} />
        </Layer>
        <Layer name="guides-layer" listening={false}>
          {guides.map((guide, i) => ( <Line key={i} points={guide.line} stroke="#FF0000" strokeWidth={1/stageScale} dash={[4, 6]} /> ))}
        </Layer>
      </Stage>
      {editingText && ( <textarea ref={textareaRef} style={getEditingTextareaStyle()} defaultValue={editingText.content} onBlur={handleTextareaBlur} onKeyDown={handleTextareaKeyDown} /> )}
    </div>
  );
};