import React from 'react';
import { KonvaEventObject } from 'konva/lib/Node';
import { useAppState } from '../../state/AppStateContext';
import { ShapeComponent } from './ShapeComponent';
import { TextComponent } from './TextComponent';
import { PathComponent } from './PathComponent';
import { FrameComponent } from './FrameComponent'; // Assuming this exists for frame backgrounds
import type { ShapeElement, TextElement, PathElement, FrameElement } from '../../state/types';

interface ElementRendererProps {
	elementId: string;
	isVisible: boolean;
	// Add the universal handlers that all elements need
	onDragEnd: (e: KonvaEventObject<DragEvent>) => void;
	onDblClick: (e: KonvaEventObject<MouseEvent>) => void;
}

export const ElementRenderer: React.FC<ElementRendererProps> = ({ elementId, isVisible, onDragEnd, onDblClick }) => {
	const { state } = useAppState();
	const element = state.elements[elementId];

	if (!element) return null;

	// Pass the handlers down to the specific renderers
	switch (element.element_type) {
		case 'shape':
			return <ShapeComponent element={element as ShapeElement} onDragEnd={onDragEnd} onDblClick={onDblClick} />;
		case 'text':
			return <TextComponent element={element as TextElement} onDragEnd={onDragEnd} onDblClick={onDblClick} isVisible={isVisible} />;
		case 'path':
			return <PathComponent element={element as PathElement} onDragEnd={onDragEnd} onDblClick={onDblClick} />;
		case 'frame':
			// The frame's background itself doesn't need a drag handler, as the parent group has it.
			// But it needs the double-click handler to potentially enter edit mode in the future.
			return <FrameComponent element={element as FrameElement} onDblClick={onDblClick} />;
		case 'group':
			return null;
		default:
			return null;
	}
};
