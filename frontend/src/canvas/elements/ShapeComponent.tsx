import React, { useMemo } from 'react';
import { Rect, Circle } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';
import type { ShapeElement, LinearGradientFill } from '../../state/types';
import { useAppState } from '../../state/AppStateContext';

interface ShapeComponentProps {
	element: ShapeElement;
	onDragEnd: (e: KonvaEventObject<DragEvent>) => void;
}

const getGradientPoints = (angle: number, width: number, height: number) => {
	const rad = angle * (Math.PI / 180);
	const x = Math.cos(rad);
	const y = Math.sin(rad);

	const len = Math.abs(width * x) + Math.abs(height * y);
	const halfLen = len / 2;

	const centerX = width / 2;
	const centerY = height / 2;

	return {
		start: { x: centerX - x * halfLen, y: centerY - y * halfLen },
		end: { x: centerX + x * halfLen, y: centerY + y * halfLen },
	};
};

export const ShapeComponent: React.FC<ShapeComponentProps> = ({ element, onDragEnd }) => {
	const { state } = useAppState();
	const isSelectedDirectly = state.selectedElementIds.includes(element.id);

	const isDraggable = (!element.parentId && !state.groupEditingId) || (element.parentId === state.groupEditingId);
	const opacity = state.groupEditingId && element.parentId === state.groupEditingId && !isSelectedDirectly ? 0.6 : 1;

	const fillProps = useMemo(() => {
		if (element.fill.type === 'solid') {
			return { fill: element.fill.color, fillGradientStops: null, fillGradientStart: null, fillGradientEnd: null };
		}
		if (element.fill.type === 'linear-gradient') {
			const gradient = element.fill as LinearGradientFill;
			const points = getGradientPoints(gradient.angle, element.width, element.height);
			return {
				fill: null, // Konva requires 'fill' to be null when using gradients
				fillLinearGradientStartPoint: points.start,
				fillLinearGradientEndPoint: points.end,
				fillLinearGradientColorStops: gradient.stops.flatMap(s => [s.offset, s.color]),
			};
		}
		return { fill: '#000000' };
	}, [element.fill, element.width, element.height]);

	const commonProps = {
		id: element.id, x: element.x, y: element.y,
		width: element.width, height: element.height,
		rotation: element.rotation, stroke: element.stroke, strokeWidth: element.stroke_width,
		onDragEnd, opacity, draggable: isDraggable,
		...fillProps,
	};

	if (element.shape_type === 'rect') return <Rect {...commonProps} />;
	if (element.shape_type === 'circle') return <Circle {...commonProps} radius={element.width / 2} />;
	return null;
};
