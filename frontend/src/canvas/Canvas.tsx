import React, { useRef } from 'react';
import { Stage, Layer, Transformer, Line } from 'react-konva';
import Konva from 'konva';
import { KonvaEventObject } from 'konva/lib/Node';
import { useAppState } from '../state/AppStateContext';
import { webSocketClient } from '../api/websocket_client';
import type { PathElement, TextElement } from '../state/types';

// Custom Hooks
import { useDrawingTool } from '../hooks/useDrawingTool';
import { usePenTool } from '../hooks/usePenTool';
import { useMarqueeSelect } from '../hooks/useMarqueeSelect';
import { usePathEditor } from '../hooks/usePathEditor';
import { usePanAndZoom } from '../hooks/usePanAndZoom';
import { useCanvasKeyboardShortcuts } from '../hooks/useCanvasKeyboardShortcuts';
import { useElementTransformer } from '../hooks/useElementTransformer';
import { useComponentDrop } from '../hooks/useComponentDrop';

// Components and Utils
import { ElementTreeRenderer } from './elements/ElementTreeRenderer';
import { TextEditorOverlay } from './TextEditorOverlay';
import { getGridStyles } from '../utils/gridUtils';

export const Canvas = () => {
  const { state, dispatch } = useAppState();
  const { elements, selectedElementIds, groupEditingId, activeTool, editingElementId } = state;

  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  // Determine current editing state
  const editingNode = editingElementId ? state.elements[editingElementId] : null;
  const isEditingText = editingNode?.element_type === 'text';
  const isEditingPath = editingNode?.element_type === 'path';
  const editingPath = isEditingPath ? (editingNode as PathElement) : null;
  
  // Initialize Tool Hooks
  const drawingTool = useDrawingTool(); // Assuming forceUpdate is no longer needed
  const penTool = usePenTool(); // Assuming forceUpdate is no longer needed
  const marqueeTool = useMarqueeSelect(activeTool);
  
  // Initialize Canvas Interaction Hooks
  const isDrawingOrEditing = drawingTool.isDrawing || penTool.isDrawing || isEditingPath;
  const { stagePos, stageScale, isPanning, handleWheel } = usePanAndZoom(drawingTool.isDrawing, isEditingPath);
  const { guides, dragHandlers, transformHandlers } = useElementTransformer({
    stageRef,
    transformerRef,
    isEditing: isDrawingOrEditing || isEditingText,
  });
  const { handleDragOver, handleDrop } = useComponentDrop(stageRef);
  useCanvasKeyboardShortcuts(drawingTool.isDrawing, penTool.isDrawing, isEditingPath, isEditingText, {
    cancelDrawing: drawingTool.cancel,
    cancelPen: penTool.cancel,
    confirmPen: penTool.onDblClick,
  });

  const pathEditor = usePathEditor(editingPath, stageScale);

  // Event Orchestration
  const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    e.evt.preventDefault();
    penTool.onMouseDown(e);
    drawingTool.onMouseDown(e);
    if (activeTool === 'select' && e.target === e.target.getStage()) {
      marqueeTool.onMouseDown(e);
    }
  };

  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    penTool.onMouseMove(e);
    drawingTool.onMouseMove(e);
    marqueeTool.onMouseMove(e);
  };

  const handleMouseUp = (e: KonvaEventObject<MouseEvent>) => {
    drawingTool.onMouseUp(e);
    marqueeTool.onMouseUp(e);
    // penTool does not have onMouseUp
  };
  
  const handleClick = (e: KonvaEventObject<MouseEvent>) => {
    // This initial guard clause is perfect, no changes needed.
    if (marqueeTool.isSelecting || isDrawingOrEditing || activeTool !== 'select') {
        return;
    }
    
    // This logic for deselecting on stage click is also perfect.
    if (e.target === stageRef.current) {
        dispatch({ type: 'SET_SELECTION', payload: { ids: [] } });
        return;
    }

    const id = e.target.id();
    const element = elements[id];
    if (!element) return;

    // This logic for selecting the parent frame is also correct.
    const idToSelect = (element.parentId && !groupEditingId) ? element.parentId : id;

    const isSelected = selectedElementIds.includes(idToSelect);

    // --- NEW AND IMPROVED SELECTION LOGIC ---

    // Check for Shift or Ctrl/Cmd (metaKey for Mac)
    const isMultiSelect = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey;

    if (isMultiSelect) {
        // --- TOGGLE BEHAVIOR ---
        if (isSelected) {
            // It's already selected, so remove it from the selection.
            dispatch({ type: 'REMOVE_FROM_SELECTION', payload: { id: idToSelect } });
        } else {
            // It's not selected, so add it to the selection.
            dispatch({ type: 'ADD_TO_SELECTION', payload: { id: idToSelect } });
        }
    } else {
        // --- NORMAL CLICK BEHAVIOR ---
        // If no modifier key is pressed, replace the entire selection.
        // We add a small optimization to only update if the selection is different.
        if (!isSelected || selectedElementIds.length > 1) {
             dispatch({ type: 'SET_SELECTION', payload: { ids: [idToSelect] } });
        }
    }
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
    
    if (element.element_type === 'text' || element.element_type === 'path') {
      dispatch({ type: 'SET_EDITING_ELEMENT_ID', payload: { id: element.id } });
    } else if (element.parentId && ['group', 'frame'].includes(elements[element.parentId]?.element_type) && !isEditingPath) {
      dispatch({ type: 'ENTER_GROUP_EDITING', payload: { groupId: element.parentId, elementId: element.id } });
    }
  };

  const topLevelElements = Object.values(elements).filter(el => !el.parentId).sort((a, b) => a.zIndex - b.zIndex);
  const gridStyles = getGridStyles(stageScale, stagePos);
  const canvasContainerStyle: React.CSSProperties = { flex: 1, position: 'relative', background: '#333639', overflow: 'hidden', ...gridStyles };

  return (
    <div style={canvasContainerStyle} onDragOver={handleDragOver} onDrop={handleDrop}>
      <Stage
        ref={stageRef}
        width={window.innerWidth - 520} height={window.innerHeight}
        x={stagePos.x} y={stagePos.y}
        scaleX={stageScale} scaleY={stageScale}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        onDblClick={handleDblClick}
        draggable={isPanning}
      >
        <Layer>
          <ElementTreeRenderer
            elementsToRender={topLevelElements}
            allElements={elements}
            dragHandlers={dragHandlers}
            onDblClick={handleDblClick}
            groupEditingId={groupEditingId}
            editingElementId={editingElementId}
            activeTool={activeTool}
          />
          {drawingTool.preview}
          {penTool.renderPreview(stageScale)}
          {marqueeTool.preview}
          {pathEditor.editUI}
          <Transformer
            ref={transformerRef}
            {...transformHandlers}
            boundBoxFunc={(oldBox, newBox) => (newBox.width < 5 || newBox.height < 5 ? oldBox : newBox)}
            ignoreStroke={true}
          />
        </Layer>
        <Layer name="guides-layer" listening={false}>
          {guides.map((guide, i) => (
            <Line key={i} points={guide.line} stroke="#FF0000" strokeWidth={1 / stageScale} dash={[4, 6]} />
          ))}
        </Layer>
      </Stage>
      <TextEditorOverlay stageRef={stageRef} />
    </div>
  );
};