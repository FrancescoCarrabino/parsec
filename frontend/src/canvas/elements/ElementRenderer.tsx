// parsec-frontend/src/canvas/elements/ElementRenderer.tsx

import React from 'react';
import { KonvaEventObject } from 'konva/lib/Node';
import { useAppState } from '../../state/AppStateContext';
import { ShapeComponent } from './ShapeComponent';
import { TextComponent } from './TextComponent';
import type { ShapeElement, TextElement, FrameElement } from '../../state/types';
// --- We'll also need the Rect component from react-konva ---
import { Rect } from 'react-konva';

interface ElementRendererProps {
	elementId: string;
	onDragEnd: (e: KonvaEventObject<DragEvent>) => void;
	onDblClick: (e: KonvaEventObject<MouseEvent>) => void;
	isVisible: boolean; // <--- ADD THIS PROP
}

export const ElementRenderer: React.FC<ElementRendererProps> = ({ elementId, onDragEnd, onDblClick, isVisible }) => { // <--- ADD isVisible HERE
	const { state } = useAppState();
	const element = state.elements[elementId];

	if (!element) return null;

	switch (element.element_type) {
		case 'shape':
			return <ShapeComponent element={element as ShapeElement} onDragEnd={onDragEnd} />;
		case 'text':
			return <TextComponent element={element as TextElement} onDragEnd={onDragEnd} onDblClick={onDblClick} isVisible={isVisible} />; // <--- PASS IT DOWN
		case 'group':
			return null;
		case 'frame':
			const frame = element as FrameElement;
			// We can implement the same advanced stroke logic here if needed,
			// for now, a simple version:
			const frameStroke = frame.stroke && frame.stroke.type === 'solid' ? frame.stroke.color : 'transparent';
			return (
				<Rect
					width={frame.width}
					height={frame.height}
					fill={frame.fill.type === 'solid' ? frame.fill.color : '#ffffff'}
					stroke={frameStroke}
					strokeWidth={frame.stroke ? frame.strokeWidth : 0}
					cornerRadius={frame.cornerRadius || 0}
				/>
			);
		default:
			return null;
	}
};
