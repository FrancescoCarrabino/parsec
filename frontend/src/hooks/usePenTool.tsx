// parsec-frontend/src/canvas/hooks/usePenTool.ts

import React, { useState, useCallback } from 'react';
import { useAppState } from '../state/AppStateContext';
import { webSocketClient } from '../api/websocket_client';
import type { PathPoint } from '../state/types';
import { KonvaEventObject } from 'konva/lib/Node';
import { Vector2d } from 'konva/lib/types';
import { Path, Line, Circle } from 'react-konva';
import { buildSvgPath } from '../utils/pathUtils';

export const usePenTool = (forceUpdate: () => void) => {
	const { state, dispatch } = useAppState();
    const { activeTool } = state;
	const [isDrawing, setIsDrawing] = useState(false);
	const [points, setPoints] = useState<PathPoint[]>([]);
	const [pointerPos, setPointerPos] = useState<Vector2d | null>(null);

    const isPenToolActive = activeTool === 'pen';

	const finalize = useCallback((isClosed: boolean = false) => {
		if (points.length < 2) {
            cancel();
            return;
        }

        // --- THIS IS THE FIX ---
        // The Frontend now calculates the bounding box and relative points.

        const all_x = points.map(p => p.x);
        const all_y = points.map(p => p.y);
        const min_x = Math.min(...all_x);
        const min_y = Math.min(...all_y);
        const max_x = Math.max(...all_x);
        const max_y = Math.max(...all_y);

        const relativePoints = points.map(p => ({
            ...p,
            x: p.x - min_x,
            y: p.y - min_y,
        }));

        const payload = {
            element_type: 'path',
            points: relativePoints,
            isClosed,
            x: min_x,
            y: min_y,
            width: max_x - min_x,
            height: max_y - min_y,
            fill: { type: 'solid', color: 'transparent' },
            stroke: { type: 'solid', color: '#333333' },
            strokeWidth: 2,
        };

		webSocketClient.sendCreateElement(payload);
        
		cancel();
		dispatch({ type: 'SET_ACTIVE_TOOL', payload: { tool: 'select' } });
	}, [points, dispatch, forceUpdate]);

	const onMouseDown = (e: KonvaEventObject<MouseEvent>) => {
		if (!isPenToolActive) return;
        const stage = e.target.getStage();
        if (!stage) return;
        const pos = stage.getRelativePointerPosition();
        if (!pos) return;
        const stageScale = stage.scaleX();

		if (isDrawing && points.length > 2) {
			const firstPoint = points[0];
			const dist = Math.sqrt(Math.pow(firstPoint.x - pos.x, 2) + Math.pow(firstPoint.y - pos.y, 2));
			if (dist < 10 / stageScale) {
				finalize(true);
				return;
			}
		}

		setPoints(prevPoints => [...prevPoints, { x: pos.x, y: pos.y }]);
		setIsDrawing(true);
        forceUpdate();
	};

	const onMouseMove = (e: KonvaEventObject<MouseEvent>) => {
		if (!isDrawing) return;
        const stage = e.target.getStage();
        if (!stage) return;
        const pos = stage.getRelativePointerPosition();
		setPointerPos(pos || null);
        forceUpdate();
	};

	const onDblClick = () => {
		if (isDrawing) {
			finalize(false);
		}
	};

	const cancel = () => {
        const wasDrawing = isDrawing;
		setIsDrawing(false);
		setPoints([]);
		setPointerPos(null);
        if (wasDrawing) {
            forceUpdate();
        }
	};
    
    const renderPreview = (currentStageScale: number) => {
        return isDrawing ? (
            <React.Fragment>
                <Path data={buildSvgPath(points, false)} stroke="#007aff" strokeWidth={2 / currentStageScale} listening={false} />
                {points.map((p, i) => (
                    <Circle
                        key={`pen-anchor-${i}`} x={p.x} y={p.y} radius={(i === 0 ? 6 : 4) / currentStageScale}
                        fill="#007aff" stroke="white" strokeWidth={1.5 / currentStageScale}
                        listening={false}
                    />
                ))}
                {pointerPos && points.length > 0 && (
                    <Line
                        points={[points[points.length - 1].x, points[points.length - 1].y, pointerPos.x, pointerPos.y]}
                        stroke="#007aff" strokeWidth={1 / currentStageScale} dash={[4, 4]} listening={false}
                    />
                )}
            </React.Fragment>
        ) : null;
    }

	return { onMouseDown, onMouseMove, onDblClick, cancel, renderPreview, isDrawing };
};