import React, { useState, useCallback } from 'react';
import { useAppState } from '../state/AppStateContext';
import { webSocketClient } from '../api/websocket_client';
import type { PathPoint } from '../state/types';
import { KonvaEventObject } from 'konva/lib/Node';
import { Vector2d } from 'konva/lib/types';
import { Path, Line, Circle } from 'react-konva';
import { buildSvgPath } from '../utils/pathUtils';

export const usePenTool = (activeTool: string, stageScale: number) => {
	const { dispatch } = useAppState();
	const [isDrawing, setIsDrawing] = useState(false);
	const [points, setPoints] = useState<PathPoint[]>([]);
	const [pointerPos, setPointerPos] = useState<Vector2d | null>(null);

	const isPenToolActive = activeTool === 'pen';

	const finalize = useCallback((isClosed: boolean = false) => {
		if (points.length >= 2) {
			webSocketClient.sendCreateElement({ element_type: 'path', points, isClosed, fill: { type: 'solid', color: isClosed ? '#cccccc' : 'transparent' }, stroke: { type: 'solid', color: '#333333' }, strokeWidth: 2 });
		}
		setIsDrawing(false);
		setPoints([]);
		dispatch({ type: 'SET_ACTIVE_TOOL', payload: { tool: 'select' } });
	}, [points, dispatch]);

	const onMouseDown = (e: KonvaEventObject<MouseEvent>) => {
		if (!isPenToolActive) return null;

		const stage = e.target.getStage();
		if (!stage) return null;
		const pos = stage.getRelativePointerPosition();
		if (!pos) return null;

		if (isDrawing && points.length > 2) {
			const firstPoint = points[0];
			const dist = Math.sqrt(Math.pow(firstPoint.x - pos.x, 2) + Math.pow(firstPoint.y - pos.y, 2));
			if (dist < 10 / stageScale) {
				finalize(true);
				return true;
			}
		}

		const newPoint: PathPoint = { x: pos.x, y: pos.y };
		setPoints([...points, newPoint]);
		setIsDrawing(true);
		return true;
	};

	const onMouseMove = (e: KonvaEventObject<MouseEvent>) => {
		if (!isDrawing) return null;
		const pos = e.target.getStage()?.getRelativePointerPosition();
		setPointerPos(pos || null);
		return true;
	};

	const onDblClick = () => {
		if (isDrawing) {
			finalize(false);
			return true;
		}
		return null;
	};

	const cancel = () => {
		setIsDrawing(false);
		setPoints([]);
		setPointerPos(null);
	};

	const preview = isDrawing ? (
		<React.Fragment>
			<Path
				data={buildSvgPath(points, false)}
				stroke="#007aff"
				strokeWidth={2 / stageScale}
				listening={false}
			/>
			{
				points.map((p, i) => (
					<Circle
						key={`pen-anchor-${i}`}
						name={i === 0 ? 'first-path-anchor' : undefined
						}
						x={p.x}
						y={p.y}
						radius={(i === 0 ? 6 : 4) / stageScale}
						fill="#007aff"
						stroke="white"
						strokeWidth={1.5 / stageScale}
					/>
				))}
			{
				pointerPos && points.length > 0 && (
					<Line
						points={[points[points.length - 1].x, points[points.length - 1].y, pointerPos.x, pointerPos.y]}
						stroke="#007aff"
						strokeWidth={1 / stageScale}
						dash={[4, 4]}
						listening={false}
					/>
				)
			}
		</React.Fragment>
	) : null;

	return {
		onMouseDown: isPenToolActive ? onMouseDown : () => null,
		onMouseMove: isDrawing ? onMouseMove : () => null,
		onDblClick: isDrawing ? onDblClick : () => null,
		cancel,
		preview,
		isDrawing,
	};
};
