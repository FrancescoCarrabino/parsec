import { useRef, useState } from 'react';
import { useAppState } from '../state/AppStateContext';
import { webSocketClient } from '../api/websocket_client';
import { KonvaEventObject } from 'konva/lib/Node';
import { Vector2d } from 'konva/lib/types';
import { Rect } from 'react-konva';

export const useDrawingTool = (activeTool: string) => {
	const { dispatch } = useAppState();
	const drawingStartPos = useRef<Vector2d>({ x: 0, y: 0 });
	const [drawingRect, setDrawingRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

	const isDrawingToolActive = ['rectangle', 'frame', 'ellipse'].includes(activeTool);

	const onMouseDown = (e: KonvaEventObject<MouseEvent>) => {
		if (!isDrawingToolActive || e.target !== e.target.getStage()) return null;

		const stage = e.target.getStage();
		if (!stage) return null;

		const pos = stage.getRelativePointerPosition();
		if (!pos) return null;

		drawingStartPos.current = pos;
		setDrawingRect({ x: pos.x, y: pos.y, width: 0, height: 0 });
		return true;
	};

	const onMouseMove = (e: KonvaEventObject<MouseEvent>) => {
		if (!drawingRect) return null;

		const stage = e.target.getStage();
		if (!stage) return null;

		const pos = stage.getRelativePointerPosition();
		if (!pos) return null;

		const startPos = drawingStartPos.current;
		setDrawingRect({
			x: Math.min(startPos.x, pos.x),
			y: Math.min(startPos.y, pos.y),
			width: Math.abs(pos.x - startPos.x),
			height: Math.abs(pos.y - startPos.y),
		});
		return true;
	};

	const onMouseUp = () => {
		if (!drawingRect) return null;

		if (drawingRect.width > 5 || drawingRect.height > 5) {
			const newElementPayload = { x: drawingRect.x, y: drawingRect.y, width: drawingRect.width, height: drawingRect.height };
			if (activeTool === 'rectangle') {
				webSocketClient.sendCreateElement({ ...newElementPayload, element_type: 'shape', shape_type: 'rect', fill: { type: 'solid', color: '#cccccc' } });
			} else if (activeTool === 'ellipse') {
				webSocketClient.sendCreateElement({ ...newElementPayload, element_type: 'shape', shape_type: 'ellipse', fill: { type: 'solid', color: '#cccccc' } });
			} else if (activeTool === 'frame') {
				webSocketClient.sendCreateElement({ ...newElementPayload, element_type: 'frame', fill: { type: 'solid', color: 'rgba(70, 70, 70, 0.5)' }, stroke: { type: 'solid', color: '#888888' }, strokeWidth: 1 });
			}
			dispatch({ type: "SET_ACTIVE_TOOL", payload: { tool: "select" } });
		}

		setDrawingRect(null);
		return true;
	};

	const preview = drawingRect ? (
		<Rect {...drawingRect} fill="rgba(0, 122, 255, 0.3)" stroke="#007aff" strokeWidth={1} listening={false} />
	) : null;

	return {
		onMouseDown: isDrawingToolActive ? onMouseDown : () => null,
		onMouseMove: drawingRect ? onMouseMove : () => null,
		onMouseUp: drawingRect ? onMouseUp : () => null,
		preview,
		isDrawing: !!drawingRect,
	};
};
