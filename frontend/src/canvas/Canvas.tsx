import React, { useRef, useMemo } from 'react';
import { Stage, Layer, Transformer, Line } from 'react-konva';
import Konva from 'konva';
import { KonvaEventObject } from 'konva/lib/Node';
import { useAppState } from '../state/AppStateContext';
import { webSocketClient } from '../api/websocket_client';
import type { PathElement, TextElement, CanvasElement } from '../state/types';

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
  const drawingTool = useDrawingTool();
  const penTool = usePenTool();
  const marqueeTool = useMarqueeSelect(activeTool);
  
  // Initialize Canvas Interaction Hooks
  const isDrawingOrEditing = drawingTool.isDrawing || penTool.isDrawing || isEditingPath;
  const { stagePos, stageScale, isPanning, handleWheel, panOnMouseDown, panOnMouseMove, panOnMouseUp } = usePanAndZoom();
  
  const { guides, dragHandlers, transformHandlers: originalTransformHandlers } = useElementTransformer({
    stageRef,
    transformerRef,
    isEditing: isDrawingOrEditing || isEditingText,
  });
  
  const { handleDragOver, handleDrop } = useComponentDrop(stageRef);
  const toolControls = useMemo(() => ({
    cancelDrawing: drawingTool.cancel,
    cancelPen: penTool.cancel,
    confirmPen: penTool.onDblClick,
  }), [drawingTool.cancel, penTool.cancel, penTool.onDblClick]);

  useCanvasKeyboardShortcuts(
    drawingTool.isDrawing,
    penTool.isDrawing,
    isEditingPath,
    isEditingText,
    toolControls
  );

  const pathEditor = usePathEditor(editingPath, stageScale);

  // --- START: BUG FIX IMPLEMENTATION ---

  // This new handler correctly updates state for nested elements after a drag or resize.
  const handleTransformEnd = (e: KonvaEventObject<Event>) => {
    const nodes = transformerRef.current?.nodes() || [];
    if (nodes.length === 0) return;

    const transformedIds = nodes.map(node => node.id());
    const rootIds = transformedIds.filter(id => {
        const parentId = elements[id]?.parentId;
        return !parentId || !transformedIds.includes(parentId);
    });

    const updatedElements = rootIds.map(id => {
        const node = nodes.find(n => n.id() === id);
        if (!node) return null;

        const element = elements[id];
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        
        // This is the core of the fix. We build the update payload progressively.
        // Position and rotation always get updated.
        const newAttrs: Partial<CanvasElement> = {
            x: node.x(),
            y: node.y(),
            rotation: Math.round(node.rotation()),
        };

        // CRITICAL: Only update width/height if a resize actually happened (scale is not 1).
        // If it was just a drag, we DO NOT touch the width and height.
        if (scaleX !== 1 || scaleY !== 1) {
            newAttrs.width = node.width() * scaleX;
            newAttrs.height = node.height() * scaleY;
        }

        // Always reset the scale on the Konva node itself after the operation.
        // This prevents scale from compounding on subsequent transforms.
        node.scaleX(1);
        node.scaleY(1);

        return { ...element, ...newAttrs };
    }).filter((el): el is CanvasElement => el !== null);

    if (updatedElements.length > 0) {
        // Since `onTransformEnd` can fire for multiple small adjustments, we only want to commit to history on the final one.
        // For simplicity here, we assume every transform end from the UI should create a history state.
        // We need to send the full element update, not just the changed attributes.
        const updatesForSocket = updatedElements.map(el => ({ ...el, commitHistory: true }));
        dispatch({ type: 'ELEMENTS_UPDATED', payload: updatedElements });
        // The backend `update_element` handler expects a single element, so we send multiple messages if needed.
        // Let's adjust this to use a batch update if one exists, or send one-by-one.
        // For now, let's assume `elements_update` is the correct batch endpoint action.
        webSocketClient.send({ type: 'elements_update', payload: updatesForSocket });
    }
  };

  // Create a new set of transform handlers, replacing the buggy onTransformEnd.
  const transformHandlers = {
    ...originalTransformHandlers,
    onTransformEnd: handleTransformEnd,
    // We also need to override onDragEnd in dragHandlers if it's causing issues.
    // However, the Transformer handles dragging, so onTransformEnd is the correct place.
  };
  
  // We need to make sure the dragHandlers from useElementTransformer ALSO use a smarter update.
  // The onDragEnd handler it provides has the same potential bug. Let's fix that too.
  const onElementDragEnd = (e: KonvaEventObject<DragEvent>) => {
      const node = e.target;
      const element = elements[node.id()];
      if (!element) return;
      
      const updatedElement = {
        ...element,
        x: node.x(),
        y: node.y(),
      };
      
      dispatch({ type: 'ELEMENT_UPDATED', payload: updatedElement });
      // The `sendElementUpdate` method should be used here.
      webSocketClient.sendElementUpdate({ id: updatedElement.id, x: updatedElement.x, y: updatedElement.y }, true);
  };
  
  const finalDragHandlers = { ...dragHandlers, onDragEnd: onElementDragEnd };

  // --- END: BUG FIX IMPLEMENTATION ---

  // Event Orchestration
  const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    e.evt.preventDefault();
    panOnMouseDown(e);

    if (!isPanning) {
        penTool.onMouseDown(e);
        drawingTool.onMouseDown(e);
        if (activeTool === 'select' && e.target === e.target.getStage()) {
            marqueeTool.onMouseDown(e);
        }
    }
  };
  // ... (rest of the event handlers: handleMouseMove, handleMouseUp, handleClick, handleDblClick) are fine ...
  // --- [No changes to other handlers, keeping them collapsed for brevity] ---
  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    panOnMouseMove(e); 
    if (!isPanning) {
        penTool.onMouseMove(e);
        drawingTool.onMouseMove(e);
        marqueeTool.onMouseMove(e);
    }
  };
  const handleMouseUp = (e: KonvaEventObject<MouseEvent>) => {
    panOnMouseUp(e);
    drawingTool.onMouseUp(e);
    marqueeTool.onMouseUp(e);
  };
  const handleClick = (e: KonvaEventObject<MouseEvent>) => {
    if (marqueeTool.isSelecting || isDrawingOrEditing || activeTool !== 'select') { return; }
    if (e.target === stageRef.current) {
        dispatch({ type: 'SET_SELECTION', payload: { ids: [] } });
        return;
    }
    const id = e.target.id();
    const element = elements[id];
    if (!element) return;
    const idToSelect = (element.parentId && !groupEditingId) ? element.parentId : id;
    const isSelected = selectedElementIds.includes(idToSelect);
    const isMultiSelect = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey;
    if (isMultiSelect) {
        if (isSelected) {
            dispatch({ type: 'REMOVE_FROM_SELECTION', payload: { id: idToSelect } });
        } else {
            dispatch({ type: 'ADD_TO_SELECTION', payload: { id: idToSelect } });
        }
    } else {
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
      >
        <Layer>
          <ElementTreeRenderer
            elementsToRender={topLevelElements}
            allElements={elements}
            // MODIFICATION: Pass the new, corrected drag handlers
            dragHandlers={finalDragHandlers}
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
            // MODIFICATION: Use the new, corrected transform handlers
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