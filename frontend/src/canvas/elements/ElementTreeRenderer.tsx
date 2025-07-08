// parsec-frontend/src/canvas/elements/ElementTreeRenderer.tsx

import React from 'react';
import { Group as KonvaGroup, Rect as KonvaRect } from 'react-konva';
import Konva from 'konva';
import { KonvaEventObject } from 'konva/lib/Node';
import type { CanvasElement, FrameElement } from '../../state/types';
import { ElementRenderer } from './ElementRenderer';

interface ElementTreeRendererProps {
  elementsToRender: CanvasElement[];
  allElements: Record<string, CanvasElement>;
  dragHandlers: any;
  onDblClick: (e: KonvaEventObject<MouseEvent>) => void;
  groupEditingId: string | null;
  editingElementId: string | null;
  activeTool: string;
}

export const ElementTreeRenderer = React.memo(function ElementTreeRenderer({
  elementsToRender, allElements, dragHandlers, onDblClick, groupEditingId, editingElementId, activeTool
}: ElementTreeRendererProps) {
  return (
    <>
      {elementsToRender.map(element => {
        // Handle containers: 'group' and 'frame'
        if (element.element_type === 'group' || element.element_type === 'frame') {
          const children = Object.values(allElements)
            .filter(el => el.parentId === element.id)
            .sort((a, b) => a.zIndex - b.zIndex);
            
          // This logic correctly determines if the container ITSELF should be draggable.
          const isContainerDraggable = groupEditingId !== element.id && (!element.parentId || groupEditingId === element.parentId) && activeTool === 'select';
          
          // --- THE CRITICAL FIX IS HERE ---
          // We only apply the drag handlers if the container is actually draggable.
          // Otherwise, we apply an empty object, effectively detaching the listeners.
          const containerDragHandlers = isContainerDraggable ? dragHandlers : {};

          const frameElement = element as FrameElement;
          
          const clipFunc = (frameElement.element_type === 'frame' && frameElement.clipsContent) 
            ? (ctx: Konva.Context) => { ctx.rect(0, 0, frameElement.width, frameElement.height); } 
            : undefined;

          return (
            <KonvaGroup
              key={element.id}
              id={element.id}
              name={`${element.id} element ${element.element_type}`}
              x={element.x}
              y={element.y}
              rotation={element.rotation}
              draggable={isContainerDraggable} // This correctly sets draggability
              {...containerDragHandlers}       // <-- THIS IS THE FIX. Uses the conditional handlers.
              clipFunc={clipFunc}
              onDblClick={onDblClick}
            >
              {/* Render the frame's background fill if it's a frame */}
              {frameElement.element_type === 'frame' && (
                <KonvaRect
                  x={0}
                  y={0}
                  width={frameElement.width}
                  height={frameElement.height}
                  fill={frameElement.fill?.type === 'solid' ? frameElement.fill.color : '#FFFFFF'}
                  cornerRadius={frameElement.cornerRadius || 0}
                  listening={false} // The background shouldn't trap events from children
                />
              )}
              
              {/* Recursively render children */}
              <ElementTreeRenderer
                elementsToRender={children}
                allElements={allElements}
                dragHandlers={dragHandlers}
                onDblClick={onDblClick}
                groupEditingId={groupEditingId}
                editingElementId={editingElementId}
                activeTool={activeTool}
              />
            </KonvaGroup>
          );
        }

        // Handle all other non-container elements (shapes, text, images)
        const isElementDraggable = (!element.parentId || groupEditingId === element.parentId) && activeTool === 'select';
        const elementDragHandlers = isElementDraggable ? dragHandlers : {};
        
        const isVisible = editingElementId !== element.id;

        return (
          <ElementRenderer 
            key={element.id} 
            elementId={element.id} 
            isVisible={isVisible} 
            onDblClick={onDblClick}
            draggable={isElementDraggable} // This part is correct from our previous fixes
            {...elementDragHandlers} 
          />
        );
      })}
    </>
  );
});