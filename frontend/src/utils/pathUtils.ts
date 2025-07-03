// parsec-frontend/src/canvas/utils/pathUtils.ts

import type { PathPoint } from "../state/types";

/**
 * Converts an array of PathPoints into an SVG path data string for Konva.
 * M = Move To (starts a new sub-path)
 * L = Line To (draws a straight line)
 * C = Curve To (draws a Bézier curve)
 * Z = Close Path
 */
export const buildSvgPath = (points: PathPoint[], isClosed: boolean): string => {
	if (points.length === 0) return "";

	const [startPoint, ...restPoints] = points;
	let path = `M ${startPoint.x} ${startPoint.y}`;

	let lastPoint = startPoint;
	for (const point of restPoints) {
		const lastHandle = lastPoint.handleOut;
		const currentHandle = point.handleIn;

		if (lastHandle && currentHandle) {
			// Bézier curve
			const cp1_x = lastPoint.x + lastHandle.x;
			const cp1_y = lastPoint.y + lastHandle.y;
			const cp2_x = point.x + currentHandle.x;
			const cp2_y = point.y + currentHandle.y;
			path += ` C ${cp1_x} ${cp1_y}, ${cp2_x} ${cp2_y}, ${point.x} ${point.y}`;
		} else {
			// Straight line
			path += ` L ${point.x} ${point.y}`;
		}
		lastPoint = point;
	}

	if (isClosed) {
		// Optional: Handle the curve back to the start point if closed
		const lastHandle = lastPoint.handleOut;
		const firstHandle = startPoint.handleIn;
		if (lastHandle && firstHandle) {
			const cp1_x = lastPoint.x + lastHandle.x;
			const cp1_y = lastPoint.y + lastHandle.y;
			const cp2_x = startPoint.x + firstHandle.x;
			const cp2_y = startPoint.y + firstHandle.y;
			path += ` C ${cp1_x} ${cp1_y}, ${cp2_x} ${cp2_y}, ${startPoint.x} ${startPoint.y}`;
		}
		path += " Z";
	}

	return path;
};

export const applyFillToProps = (props: any, fill: Fill, width: number, height: number, prefix: 'fill' | 'stroke' = 'fill') => {
	if (fill.type === 'solid') {
		props[prefix] = fill.color;
	} else if (fill.type === 'linear-gradient') {
		const angle = fill.angle || 0;
		const rad = (angle - 90) * (Math.PI / 180);
		const x = Math.cos(rad);
		const y = Math.sin(rad);
		const len = Math.abs(width * x) + Math.abs(height * y);
		const halfLen = len / 2;
		const centerX = width / 2;
		const centerY = height / 2;

		props[`${prefix}LinearGradientStartPoint`] = { x: centerX - x * halfLen, y: centerY - y * halfLen };
		props[`${prefix}LinearGradientEndPoint`] = { x: centerX + x * halfLen, y: centerY + y * halfLen };
		props[`${prefix}LinearGradientColorStops`] = fill.stops.flatMap(s => [s.offset, s.color]);
	}
};
