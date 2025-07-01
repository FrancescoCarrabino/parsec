import React, { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Transformer, Group as KonvaGroup, Rect } from 'react-konva';
import Konva from 'konva';
import { KonvaEventObject } from 'konva/lib/Node';
import { useAppState } from '../state/AppStateContext';
import { ElementRenderer } from './elements/ElementRenderer';
import { webSocketClient } from '../api/websocket_client';
import type { CanvasElement, TextElement } from '../state/types';
import { Vector2d } from 'konva/lib/types';

export const Canvas = () => {
  const { state, dispatch } = useAppState();
  const { elements, selectedElementIds, groupEditingId, activeTool } = state;

  // --- Canvas view state ---
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);
  const [isPanning, setIsPanning] = useState(false);

  // --- Tool-specific state ---
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingRect, setDrawingRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const drawingStartPos = useRef<Vector2d>({ x: 0, y: 0 });

  // --- Marquee selection state ---
  const [isMarqueeSelecting, setIsMarqueeSelecting] = useState(false);
  const [marqueeRect, setMarqueeRect] = useState<{ x: number, y: number, width: number, height: number } | null>(null);

  // --- State for the inline text editing overlay ---
  const [editingText, setEditingText] = useState<{ id: string; node: Konva.Text } | null>(null);

  // --- Refs for direct node manipulation ---
  const transformerRef = useRef<Konva.Transformer>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (stage?.container()) {
      if (isPanning) stage.container().style.cursor = 'grab';
      else if (activeTool === 'rectangle' || activeTool === 'frame') stage.container().style.cursor = 'crosshair';
      else if (activeTool === 'text') stage.container().style.cursor = 'text';
      else stage.container().style.cursor = 'default';
    }
  }, [isPanning, activeTool]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isTyping = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA';
      if (e.key === ' ' && !isTyping) { e.preventDefault(); setIsPanning(true); }
      if (e.key === 'Escape') {
        if (editingText) { setEditingText(null); }
        else if (groupEditingId) { dispatch({ type: 'EXIT_GROUP_EDITING' }); }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') { e.preventDefault(); setIsPanning(false); }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [dispatch, groupEditingId, editingText]);

  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;
    const selectedNodes = selectedElementIds.map(id => stageRef.current!.findOne(`#${id}`)).filter((node): node is Konva.Node => !!node);
    transformerRef.current.nodes(selectedNodes);
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedElementIds]);

  useEffect(() => {
    if (editingText && textareaRef.current) { textareaRef.current.focus(); }
  }, [editingText]);

  // --- Helper function for collision detection ---
  const haveIntersection = (r1: any, r2: any) => {
    return !(r2.x > r1.x + r1.width || r2.x + r2.width < r1.x || r2.y > r1.y + r1.height || r2.y + r2.height < r1.y);
  };

  // --- Text Editing Handlers ---
  const finishEditing = () => {
    if (!editingText || !textareaRef.current) return;
    const newContent = textareaRef.current.value;
    webSocketClient.sendElementUpdate({ id: editingText.id, content: newContent });
    setEditingText(null);
  };
  const handleTextareaBlur = () => { finishEditing(); };
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finishEditing(); }
    if (e.key === 'Escape') { setEditingText(null); }
  };

  // --- Canvas and Element Event Handlers ---
  const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    setMarqueeRect(null); // Clear previous marquee on any new mousedown

    if (e.target !== stageRef.current) return; // Only initiate actions on stage background

    if (activeTool === 'select' && !isPanning) {
      setIsMarqueeSelecting(true);
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      setMarqueeRect({ x: pos.x, y: pos.y, width: 0, height: 0 });
      dispatch({ type: 'SET_SELECTION', payload: { ids: [] } });
      return;
    }

    if (activeTool === 'text') {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      webSocketClient.sendCreateElement({ element_type: 'text', x: pos.x, y: pos.y, content: 'Type...', fontSize: 24, fontFamily: 'Inter', fontColor: '#333333' });
      dispatch({ type: "SET_ACTIVE_TOOL", payload: { tool: "select" } });
      return;
    }

    const isDrawingToolActive = activeTool === 'rectangle' || activeTool === 'frame';
    if (isPanning || !isDrawingToolActive) return;
    setIsDrawing(true);
    const pos = e.target.getStage()?.getRelativePointerPosition();
    if (!pos) return;
    drawingStartPos.current = pos;
    setDrawingRect({ x: pos.x, y: pos.y, width: 0, height: 0 });
  };

  const handleElementDblClick = (e: KonvaEventObject<MouseEvent>) => {
    const node = e.target; const id = node.id(); const element = elements[id] as TextElement;
    if (element && element.element_type === 'text') {
      transformerRef.current?.nodes([]); setEditingText({ id, node: node as Konva.Text });
    }
  };

  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    const pos = e.target.getStage()?.getRelativePointerPosition();
    if (!pos) return;

    if (isMarqueeSelecting) {
      const startPos = marqueeRect!;
      setMarqueeRect({
        x: Math.min(startPos.x, pos.x), y: Math.min(startPos.y, pos.y),
        width: Math.abs(pos.x - startPos.x), height: Math.abs(pos.y - startPos.y),
      });
      return;
    }

    if (!isDrawing) return;
    const startPos = drawingStartPos.current;
    setDrawingRect({
      x: Math.min(startPos.x, pos.x), y: Math.min(startPos.y, pos.y),
      width: Math.abs(pos.x - startPos.x), height: Math.abs(pos.y - startPos.y),
    });
  };

  const handleMouseUp = () => {
    if (isMarqueeSelecting && marqueeRect) {
      const stage = stageRef.current;
      if (stage) {
        const allNodes = stage.find('Rect, Circle, Text, Group');
        const selectedNodes = allNodes.filter((node) => {
          if (node.getParent()?.className === 'Transformer') return false;
          return haveIntersection(marqueeRect, node.getClientRect());
        });

        const idsToSelect = new Set<string>();
        selectedNodes.forEach(node => {
          const element = elements[node.id()];
          if (element) {
            if (element.parentId && !groupEditingId) { idsToSelect.add(element.parentId); }
            else { idsToSelect.add(element.id); }
          }
        });
        dispatch({ type: 'SET_SELECTION', payload: { ids: Array.from(idsToSelect) } });
      }
      setIsMarqueeSelecting(false);
      return;
    }

    setIsDrawing(false);
    if (!drawingRect || (drawingRect.width < 5 && drawingRect.height < 5)) {
      setDrawingRect(null); return;
    }

    if (activeTool === 'rectangle') {
      webSocketClient.sendCreateElement({ element_type: 'shape', shape_type: 'rect', x: drawingRect.x, y: drawingRect.y, width: drawingRect.width, height: drawingRect.height, fill: { type: 'solid', color: '#cccccc' } });
    } else if (activeTool === 'frame') {
      webSocketClient.sendCreateElement({ element_type: 'frame', x: drawingRect.x, y: drawingRect.y, width: drawingRect.width, height: drawingRect.height, fill: { type: 'solid', color: 'rgba(70, 70, 70, 0.5)' }, stroke: 'rgba(255, 255, 255, 0.2)' });
    }
    setDrawingRect(null);
    dispatch({ type: "SET_ACTIVE_TOOL", payload: { tool: "select" } });
  };

  const handleSelection = (e: KonvaEventObject<MouseEvent>) => {
    if (activeTool !== 'select' || editingText) return;
    const target = e.target;
    if (target === stageRef.current) {
      if (groupEditingId) dispatch({ type: 'EXIT_GROUP_EDITING' });
      else dispatch({ type: 'SET_SELECTION', payload: { ids: [] } });
      return;
    }
    const id = target.id(); const element = elements[id]; if (!element) return;
    const idToSelect = (element.parentId && !groupEditingId) ? element.parentId : id;
    if (e.evt.shiftKey) {
      if (selectedElementIds.includes(idToSelect)) dispatch({ type: 'REMOVE_FROM_SELECTION', payload: { id: idToSelect } });
      else dispatch({ type: 'ADD_TO_SELECTION', payload: { id: idToSelect } });
    } else { dispatch({ type: 'SET_SELECTION', payload: { ids: [idToSelect] } }); }
  };

  const handleStageDblClick = (e: KonvaEventObject<MouseEvent>) => {
    const target = e.target; if (target === stageRef.current) return; const id = target.id(); const element = elements[id];
    if (element?.parentId && (elements[element.parentId]?.element_type === 'group' || elements[element.parentId]?.element_type === 'frame')) {
      dispatch({ type: 'ENTER_GROUP_EDITING', payload: { groupId: element.parentId, elementId: element.id } });
    }
  };

  const handleElementDragEnd = (e: KonvaEventObject<DragEvent>) => { webSocketClient.sendElementUpdate({ id: e.target.id(), x: e.target.x(), y: e.target.y() }); };
  const handleTransformEnd = (e: KonvaEventObject<Event>) => {
    const node = e.target; const element = elements[node.id()]; if (!element) return;
    const scaleX = node.scaleX(); const scaleY = node.scaleY();
    node.scaleX(1); node.scaleY(1);
    webSocketClient.sendElementUpdate({ id: element.id, x: node.x(), y: node.y(), rotation: Math.round(node.rotation()), width: Math.max(5, (element.width || 0) * scaleX), height: Math.max(5, (element.height || 0) * scaleY) });
  };
  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault(); if (editingText) finishEditing();
    const stage = stageRef.current; if (!stage) return;
    const scaleBy = 1.1; const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition(); if (!pointer) return;
    const mousePointTo = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale };
    const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
    setStageScale(newScale);
    setStagePos({ x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale });
  };

  const renderElements = (elementList: CanvasElement[]): React.ReactNode[] => {
    return elementList.map(element => {
      if (element.element_type === 'group' || element.element_type === 'frame') {
        const children = Object.values(elements).filter(el => el.parentId === element.id).sort((a, b) => a.zIndex - b.zIndex);
        const clipFunc = (element.element_type === 'frame' && element.clipsContent) ? (ctx: Konva.Context) => { ctx.rect(0, 0, element.width, element.height); } : undefined;
        return (
          <KonvaGroup key={element.id} id={element.id} x={element.x} y={element.y} rotation={element.rotation} draggable={!groupEditingId} onDragEnd={handleElementDragEnd} clipFunc={clipFunc}>
            <ElementRenderer elementId={element.id} onDragEnd={handleElementDragEnd} onDblClick={handleElementDblClick} isVisible={true} />
            {renderElements(children)}
          </KonvaGroup>
        );
      }
      const isVisible = editingText?.id !== element.id;
      return <ElementRenderer key={element.id} elementId={element.id} onDragEnd={handleElementDragEnd} onDblClick={handleElementDblClick} isVisible={isVisible} />;
    });
  };

  const topLevelElements = Object.values(elements).filter(el => !el.parentId && el.isVisible).sort((a, b) => a.zIndex - b.zIndex);

  const getEditingTextareaStyle = (): React.CSSProperties => {
    if (!editingText) return { display: 'none' };
    const { node } = editingText; const textPosition = node.getAbsolutePosition(); const stage = node.getStage(); if (!stage) return { display: 'none' };
    const areaPosition = { x: stage.container().offsetLeft + textPosition.x, y: stage.container().offsetTop + textPosition.y };
    return { position: 'absolute', top: `${areaPosition.y}px`, left: `${areaPosition.x}px`, width: `${node.width() * stage.scaleX()}px`, height: `${node.height() * stage.scaleX() + 10}px`, fontSize: `${node.fontSize() * stage.scaleY()}px`, fontFamily: node.fontFamily(), lineHeight: node.lineHeight(), padding: '0px', margin: '0px', border: '1px solid #007aff', background: 'rgba(255, 255, 255, 0.9)', outline: 'none', resize: 'none', overflow: 'hidden', color: node.fill(), textAlign: node.align() as 'left' | 'center' | 'right', transformOrigin: 'top left', transform: `rotate(${node.rotation()}deg)` };
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Stage ref={stageRef} width={window.innerWidth - 520} height={window.innerHeight} onClick={handleSelection} onDblClick={handleStageDblClick} onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} scaleX={stageScale} scaleY={stageScale} x={stagePos.x} y={stagePos.y} draggable={isPanning} onDragEnd={(e) => { if (isPanning) setStagePos(e.target.position()) }}>
        <Layer>
          {renderElements(topLevelElements)}
          {drawingRect && <Rect {...drawingRect} fill="rgba(0, 122, 255, 0.3)" stroke="#007aff" strokeWidth={1} />}
          {marqueeRect && <Rect {...marqueeRect} fill="rgba(0, 122, 255, 0.15)" stroke="#007aff" strokeWidth={1} strokeScaleEnabled={false} dash={[4, 4]} />}
          <Transformer ref={transformerRef} onTransformEnd={handleTransformEnd} boundBoxFunc={(oldBox, newBox) => newBox.width < 5 || newBox.height < 5 ? oldBox : newBox} />
        </Layer>
      </Stage>
      {editingText && (<textarea ref={textareaRef} style={getEditingTextareaStyle()} defaultValue={editingText.node.text()} onBlur={handleTextareaBlur} onKeyDown={handleTextareaKeyDown} />)}
    </div>
  );
};
