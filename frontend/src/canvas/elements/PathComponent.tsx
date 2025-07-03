// parsec-frontend/src/canvas/elements/PathComponent.tsx

import React, { useMemo } from 'react';
import { Path } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';
import type { PathElement } from '../../state/types';
import { useAppState } from '../../state/AppStateContext';
import { buildSvgPath, applyFillToProps } from '../../utils/pathUtils';

interface PathComponentProps {
  element: PathElement;
  onDragEnd: (e: KonvaEventObject<DragEvent>) => void;
  onDblClick: (e: KonvaEventObject<MouseEvent>) => void;
}

export const PathComponent: React.FC<PathComponentProps> = ({ element, onDragEnd, onDblClick }) => {
  const { state } = useAppState();
  const { groupEditingId } = state;

  // An element is draggable if it's a top-level element OR if its group is being edited.
  const isDraggable = !element.parentId || (groupEditingId === element.parentId);

  // Memoize the SVG path data generation so it only runs when points change.
  const svgPathData = useMemo(() => buildSvgPath(element.points, element.isClosed), [element.points, element.isClosed]);

  // Memoize the generation of Konva properties. This is where the fix is applied.
  const konvaProps = useMemo(() => {
    const props: any = {};
    const { fill, stroke, strokeWidth, width, height } = element;

    // --- FIX: Correctly handle null/undefined fill ---
    if (fill) {
      applyFillToProps(props, fill, width, height, 'fill');
    } else {
      // Explicitly tell Konva to not render a fill.
      props.fillEnabled = false;
    }

    // --- FIX: Correctly handle null/undefined stroke ---
    if (stroke) {
      props.strokeWidth = strokeWidth;
      applyFillToProps(props, stroke, width, height, 'stroke');
    } else {
      // Explicitly tell Konva to not render a stroke.
      props.strokeEnabled = false;
    }

    return props;
  }, [element.fill, element.stroke, element.strokeWidth, element.width, element.height]);

  return (
    <Path
      id={element.id}
      name={element.id} // Name is crucial for event delegation
      x={element.x}
      y={element.y}
      width={element.width}
      height={element.height}
      rotation={element.rotation}
      draggable={isDraggable}
      onDragEnd={isDraggable ? onDragEnd : undefined}
      onDblClick={onDblClick}
      data={svgPathData}
      // This ensures stroke width doesn't change on scale, which is standard for design tools.
      strokeScaleEnabled={false}
      // Spread the calculated properties, including the fixes for fillEnabled/strokeEnabled.
      {...konvaProps}
    />
  );
};