import React, { useMemo } from 'react';
import { Rect, Circle, Ellipse } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';
import type { ShapeElement } from '../../state/types';
import { useAppState } from '../../state/AppStateContext';
import { applyFillToProps } from '../../utils/pathUtils';

interface ShapeComponentProps {
  element: ShapeElement;
  isVisible: boolean;
  onDragStart: (e: KonvaEventObject<DragEvent>) => void;
  onDragMove: (e: KonvaEventObject<DragEvent>) => void;
  onDragEnd: (e: KonvaEventObject<DragEvent>) => void;
  onDblClick: (e: KonvaEventObject<MouseEvent>) => void;
}

export const ShapeComponent: React.FC<ShapeComponentProps> = ({ element, isVisible, onDragStart, onDragMove, onDragEnd, onDblClick }) => {
  const { state } = useAppState();
  const { groupEditingId } = state;
  const isDraggable = !element.parentId || (groupEditingId === element.parentId);
  const konvaProps = useMemo(() => {
    const props: any = {};
    const { fill, stroke, strokeWidth, width, height, cornerRadius } = element;
    if (fill) { applyFillToProps(props, fill, width, height, 'fill'); } else { props.fillEnabled = false; }
    if (stroke) { props.strokeWidth = strokeWidth; applyFillToProps(props, stroke, width, height, 'stroke'); } else { props.strokeEnabled = false; }
    if (cornerRadius) { props.cornerRadius = cornerRadius; }
    return props;
  }, [element.fill, element.stroke, element.strokeWidth, element.cornerRadius, element.width, element.height]);

  const commonProps = {
    id: element.id, name: `${element.id} element`,
    x: element.x, y: element.y,
    width: element.width, height: element.height,
    rotation: element.rotation,
    draggable: isDraggable,
    visible: isVisible,
    onDragStart: isDraggable ? onDragStart : undefined,
    onDragMove: isDraggable ? onDragMove : undefined,
    onDragEnd: isDraggable ? onDragEnd : undefined,
    onDblClick: onDblClick,
    ...konvaProps,
  };

  if (element.shape_type === 'ellipse') return <Ellipse {...commonProps} radiusX={element.width / 2} radiusY={element.height / 2} />;
  if (element.shape_type === 'circle') return <Circle {...commonProps} radius={element.width / 2} />;
  return <Rect {...commonProps} />;
};