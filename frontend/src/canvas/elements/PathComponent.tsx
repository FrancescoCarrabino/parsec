// parsec-frontend/src/canvas/elements/PathComponent.tsx

import React, { useMemo } from 'react';
import { Path } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';
import type { PathElement } from '../../state/types';
import { useAppState } from '../../state/AppStateContext';
import { buildSvgPath, applyFillToProps } from '../../utils/pathUtils';

interface PathComponentProps {
  element: PathElement;
  onDragStart: (e: KonvaEventObject<DragEvent>) => void;
  onDragMove: (e: KonvaEventObject<DragEvent>) => void;
  onDragEnd: (e: KonvaEventObject<DragEvent>) => void;
  onDblClick: (e: KonvaEventObject<MouseEvent>) => void;
}

export const PathComponent: React.FC<PathComponentProps> = ({ element, onDragStart, onDragMove, onDragEnd, onDblClick }) => {
  const { state } = useAppState();
  const { groupEditingId, activeTool } = state;

  // --- THIS IS THE FIX ---
  const isDraggable = activeTool === 'select' && (!element.parentId || (groupEditingId === element.parentId));

  const svgPathData = useMemo(() => buildSvgPath(element.points, element.isClosed), [element.points, element.isClosed]);
  const konvaProps = useMemo(() => {
    // ... (no changes to this memoized block, it's already correct from our previous fix)
    const props: any = {};
    const { fill, stroke, strokeWidth, width, height } = element;
    if (fill) { applyFillToProps(props, fill, width, height, 'fill'); } else { props.fillEnabled = false; }
    if (stroke) { props.strokeWidth = strokeWidth; applyFillToProps(props, stroke, width, height, 'stroke'); } else { props.strokeEnabled = false; }
    return props;
  }, [element.fill, element.stroke, element.strokeWidth, element.width, element.height]);

  return (
    <Path
      id={element.id} name={`${element.id} element`}
      x={element.x} y={element.y}
      width={element.width} height={element.height}
      rotation={element.rotation}
      draggable={isDraggable}
      onDragStart={isDraggable ? onDragStart : undefined}
      onDragMove={isDraggable ? onDragMove : undefined}
      onDragEnd={isDraggable ? onDragEnd : undefined}
      onDblClick={onDblClick}
      data={svgPathData}
      strokeScaleEnabled={false}
      {...konvaProps}
    />
  );
};