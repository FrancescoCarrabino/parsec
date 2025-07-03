import React from 'react';
import { Text } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';
import type { TextElement } from '../../state/types';
import { useAppState } from '../../state/AppStateContext';

interface TextComponentProps {
  element: TextElement;
  isVisible: boolean;
  onDragStart: (e: KonvaEventObject<DragEvent>) => void;
  onDragMove: (e: KonvaEventObject<DragEvent>) => void;
  onDragEnd: (e: KonvaEventObject<DragEvent>) => void;
  onDblClick: (e: KonvaEventObject<MouseEvent>) => void;
}

export const TextComponent: React.FC<TextComponentProps> = ({ element, isVisible, onDragStart, onDragMove, onDragEnd, onDblClick }) => {
  const { state } = useAppState();
  const { groupEditingId } = state;
  const isDraggable = !element.parentId || (groupEditingId === element.parentId);

  return (
    <Text
      id={element.id} name={`${element.id} element`}
      x={element.x} y={element.y}
      width={element.width} height={element.height}
      rotation={element.rotation}
      draggable={isDraggable}
      visible={isVisible}
      onDragStart={isDraggable ? onDragStart : undefined}
      onDragMove={isDraggable ? onDragMove : undefined}
      onDragEnd={isDraggable ? onDragEnd : undefined}
      onDblClick={onDblClick}
      text={element.content}
      fontSize={element.fontSize}
      fontFamily={element.fontFamily}
      fontStyle={`${element.fontWeight}`}
      fill={element.fontColor}
      align={element.align}
      verticalAlign={element.verticalAlign}
      letterSpacing={element.letterSpacing}
      lineHeight={element.lineHeight}
      wrap="word"
    />
  );
};