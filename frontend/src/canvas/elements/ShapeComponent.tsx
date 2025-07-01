import React, { useMemo } from 'react';
import { Rect, Circle } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';
import type { ShapeElement, LinearGradientFill } from '../../state/types';
import { useAppState } from '../../state/AppStateContext';

interface ShapeComponentProps {
	element: ShapeElement;
	onDragEnd: (e: KonvaEventObject<DragEvent>) => void;
}

// Helper function to calculate start and end points for a linear gradient
const getGradientPoints = (angle: number, width: number, height: number) => {
	const rad = angle * (Math.PI / 180);
	const x = Math.cos(rad);
	const y = Math.sin(rad);

	// Calculate the length of the gradient line based on the angle and dimensions
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

	// Memoized calculation for FILL properties
	const fillProps = useMemo(() => {
		if (element.fill.type === 'solid') {
			return {
				fill: element.fill.color,
				fillLinearGradientStartPoint: null,
				fillLinearGradientEndPoint: null,
				fillLinearGradientColorStops: null,
			};
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
		return { fill: '#000000' }; // Default fallback
	}, [element.fill, element.width, element.height]);

	// Memoized calculation for STROKE properties
	const strokeProps = useMemo(() => {
		if (!element.stroke) {
			return {
				strokeEnabled: false // Disable stroke if null
			};
		}
		if (element.stroke.type === 'solid') {
			return {
				strokeEnabled: true,
				stroke: element.stroke.color,
				strokeLinearGradientStartPoint: null,
				strokeLinearGradientEndPoint: null,
				strokeLinearGradientColorStops: null,
			};
		}
		if (element.stroke.type === 'linear-gradient') {
			const gradient = element.stroke as LinearGradientFill;
			const points = getGradientPoints(gradient.angle, element.width, element.height);
			return {
				strokeEnabled: true,
				stroke: null, // Konva requires 'stroke' to be null when using gradients
				strokeLinearGradientStartPoint: points.start,
				strokeLinearGradientEndPoint: points.end,
				strokeLinearGradientColorStops: gradient.stops.flatMap(s => [s.offset, s.color]),
			};
		}
		return { strokeEnabled: false };
	}, [element.stroke, element.width, element.height]);

	// Combine all props for the Konva node
	const commonProps = {
		id: element.id,
		x: element.x,
		y: element.y,
		width: element.width,
		height: element.height,
		rotation: element.rotation,
		strokeWidth: element.stroke ? element.strokeWidth : 0,
		onDragEnd,
		opacity,
		draggable: isDraggable,
		cornerRadius: element.cornerRadius || 0,
		...fillProps,
		...strokeProps,
	};

	if (element.shape_type === 'rect') {
		return <Rect {...commonProps} />;
	}
	if (element.shape_type === 'circle') {
		// Konva's Circle uses radius, not width/height
		return <Circle {...commonProps} radius={element.width / 2} />;
	}
	return null;
};
