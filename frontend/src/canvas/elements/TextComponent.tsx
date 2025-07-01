// parsec-frontend/src/canvas/elements/TextComponent.tsx

import React from 'react';
import { Text } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';
import type { TextElement } from '../../state/types';
import { useAppState } from '../../state/AppStateContext';

interface TextComponentProps {
	element: TextElement;
	onDragEnd: (e: KonvaEventObject<DragEvent>) => void;
	onDblClick: (e: KonvaEventObject<MouseEvent>) => void;
	isVisible: boolean; // <--- ADD THIS PROP
}

export const TextComponent: React.FC<TextComponentProps> = ({ element, onDragEnd, onDblClick, isVisible }) => { // <--- ADD isVisible HERE
	const { state } = useAppState();
	const isSelectedDirectly = state.selectedElementIds.includes(element.id);
	const isDraggable = (!element.parentId && !state.groupEditingId) || (element.parentId === state.groupEditingId);
	const opacity = state.groupEditingId && element.parentId === state.groupEditingId && !isSelectedDirectly ? 0.6 : 1;

	return (
		<Text
			id={element.id}
			x={element.x}
			y={element.y}
			text={element.content}
			fontSize={element.fontSize}
			fontFamily={element.fontFamily}
			fill={element.fontColor}
			width={element.width}
			height={element.height}
			align={element.align}
			verticalAlign={element.verticalAlign}
			rotation={element.rotation}
			draggable={isDraggable}
			onDragEnd={onDragEnd}
			onDblClick={onDblClick}
			opacity={opacity}
			visible={isVisible} // <--- APPLY THE PROP HERE
		/>
	);
};
