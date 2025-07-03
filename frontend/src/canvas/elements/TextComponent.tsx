import React from 'react';
import { Text } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';
import type { TextElement } from '../../state/types';
import { useAppState } from '../../state/AppStateContext';

interface TextComponentProps {
  element: TextElement;
  isVisible: boolean;
  onDragEnd: (e: KonvaEventObject<DragEvent>) => void;
  onDblClick: (e: KonvaEventObject<MouseEvent>) => void;
}

export const TextComponent: React.FC<TextComponentProps> = ({ element, isVisible, onDragEnd, onDblClick }) => {
  const { state } = useAppState();
  const { groupEditingId } = state;
  const isDraggable = !element.parentId || (groupEditingId === element.parentId);

  return (
    <Text
      id={element.id} name={element.id}
      x={element.x} y={element.y}
      width={element.width} height={element.height}
      text={element.content}
      fontSize={element.fontSize}
      fontFamily={element.fontFamily}
      fill={element.fontColor}
      align={element.align}
      verticalAlign={element.verticalAlign}
      rotation={element.rotation}
      draggable={isDraggable}
      onDragEnd={isDraggable ? onDragEnd : undefined}
      onDblClick={onDblClick}
      visible={isVisible}
    />
  );
};