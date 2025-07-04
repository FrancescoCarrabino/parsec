// parsec-frontend/src/canvas/elements/ElementRenderer.tsx

import React from 'react';
import { KonvaEventObject } from 'konva/lib/Node';
import { useAppState } from '../../state/AppStateContext';
import { ShapeComponent } from './ShapeComponent';
import { TextComponent } from './TextComponent';
import { PathComponent } from './PathComponent';
import { FrameComponent } from './FrameComponent';
import ImageComponent from './ImageComponent'; // <-- IMPORT NEW COMPONENT
import type { ShapeElement, TextElement, PathElement, FrameElement, ImageElement } from '../../state/types'; // <-- IMPORT NEW TYPE

interface ElementRendererProps {
	elementId: string;
	isVisible: boolean;
	onDragStart: (e: KonvaEventObject<DragEvent>) => void;
	onDragMove: (e: KonvaEventObject<DragEvent>) => void;
	onDragEnd: (e: KonvaEventObject<DragEvent>) => void;
	onDblClick: (e: KonvaEventObject<MouseEvent>) => void;
}

export const ElementRenderer: React.FC<ElementRendererProps> = (props) => {
	const { state } = useAppState();
	const { elementId, isVisible, onDragStart, onDragMove, onDragEnd, onDblClick } = props;
	const element = state.elements[elementId];

	if (!element) return null;

	// Prepare the common props for draggable elements.
	const commonProps = { onDragStart, onDragMove, onDragEnd, onDblClick, isVisible };
	
	switch (element.element_type) {
		case 'shape':
			return <ShapeComponent element={element as ShapeElement} {...commonProps} />;
		case 'text':
			return <TextComponent element={element as TextElement} {...commonProps} />;
		case 'path':
			return <PathComponent element={element as PathElement} {...commonProps} />;
        
        // --- ADDED CASE FOR IMAGE ---
		case 'image':
			// The `ImageComponent` will internally handle loading.
			// It receives the same drag handlers as other elements.
			return <ImageComponent element={element as ImageElement} {...commonProps} />;
            
		case 'frame':
			// Frames are containers; their background isn't draggable itself.
			// The draggable behavior is on the <KonvaGroup> in Canvas.tsx.
			return <FrameComponent element={element as FrameElement} onDblClick={onDblClick} />;
		case 'group':
			// Groups are just logical containers; they don't render anything themselves.
			return null;
		default:
			// Log an error for unhandled element types to help with debugging.
            console.error(`Unknown element type: ${(element as any).element_type}`);
			return null;
	}
};