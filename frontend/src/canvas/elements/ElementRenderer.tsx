import React from 'react';
import { KonvaEventObject } from 'konva/lib/Node';
import { useAppState } from '../../state/AppStateContext';
import { ShapeComponent } from './ShapeComponent';
import type { ShapeElement } from '../../state/types';

interface ElementRendererProps {
	elementId: string;
	onDragEnd: (e: KonvaEventObject<DragEvent>) => void;
}

export const ElementRenderer: React.FC<ElementRendererProps> = ({ elementId, onDragEnd }) => {
	const { state } = useAppState();
	const element = state.elements[elementId];

	if (!element) return null;

	switch (element.element_type) {
		case 'shape':
			return <ShapeComponent element={element as ShapeElement} onDragEnd={onDragEnd} />;
		case 'group':
			return null;
		default:
			return null;
	}
};
