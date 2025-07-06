import React from 'react';
import { Group as KonvaGroup } from 'react-konva';
import Konva from 'konva';
import { KonvaEventObject } from 'konva/lib/Node';
import type { CanvasElement, ElementsMap } from '../../state/types';
import { ElementRenderer } from './ElementRenderer';

interface ElementTreeRendererProps {
  elementsToRender: CanvasElement[];
  allElements: ElementsMap;
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
        if (element.element_type === 'group' || element.element_type === 'frame') {
          const children = Object.values(allElements)
            .filter(el => el.parentId === element.id)
            .sort((a, b) => a.zIndex - b.zIndex);
            
          const isGroupDraggable = (!element.parentId || groupEditingId === element.parentId) && activeTool === 'select';
          const clipFunc = (element.element_type === 'frame' && element.clipsContent) ? (ctx: Konva.Context) => { ctx.rect(0, 0, element.width, element.height); } : undefined;

          return (
            <KonvaGroup
              key={element.id}
              id={element.id}
              name={`${element.id} element`}
              x={element.x}
              y={element.y}
              rotation={element.rotation}
              draggable={isGroupDraggable}
              {...dragHandlers}
              clipFunc={clipFunc}
              onDblClick={onDblClick}
            >
              <ElementRenderer elementId={element.id} isVisible={true} onDblClick={onDblClick} />
              <ElementTreeRenderer {...{ elementsToRender: children, allElements, dragHandlers, onDblClick, groupEditingId, editingElementId, activeTool }} />
            </KonvaGroup>
          );
        }

        const isElementDraggable = (!element.parentId || groupEditingId === element.parentId) && activeTool === 'select';
        const elementDragHandlers = isElementDraggable ? dragHandlers : {};
        const isVisible = editingElementId !== element.id;

        return <ElementRenderer key={element.id} elementId={element.id} isVisible={isVisible} onDblClick={onDblClick} {...elementDragHandlers} />;
      })}
    </>
  );
});