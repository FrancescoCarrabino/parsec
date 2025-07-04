// parsec-frontend/src/canvas/hooks/useDrawingTool.ts

import React, { useState } from 'react';
import { useAppState } from '../state/AppStateContext';
import { webSocketClient } from '../api/websocket_client';
import { KonvaEventObject } from 'konva/lib/Node';
import { Vector2d } from 'konva/lib/types';
import { Rect, Ellipse } from 'react-konva';

export const useDrawingTool = (forceUpdate: () => void) => {
	const { state, dispatch } = useAppState();
    const { activeTool } = state;
	const [startPos, setStartPos] = useState<Vector2d | null>(null);
	const [currentRect, setCurrentRect] = useState<{ x: number, y: number, width: number, height: number } | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);

    const isDrawingToolActive = activeTool === 'rectangle' || activeTool === 'ellipse' || activeTool === 'frame' || activeTool === 'text';

	const onMouseDown = (e: KonvaEventObject<MouseEvent>) => {
        if (!isDrawingToolActive) return;
        const stage = e.target.getStage();
        if (!stage) return;
        const pos = stage.getRelativePointerPosition();
        if (!pos) return;

        // Special case for Text tool which is click-to-create
        if (activeTool === 'text') {
            webSocketClient.sendCreateElement({ element_type: 'text', x: pos.x, y: pos.y });
            dispatch({ type: 'SET_ACTIVE_TOOL', payload: { tool: 'select' } });
            return;
        }

		setStartPos(pos);
		setCurrentRect({ x: pos.x, y: pos.y, width: 0, height: 0 });
		setIsDrawing(true);
        forceUpdate();
	};

	const onMouseMove = (e: KonvaEventObject<MouseEvent>) => {
		if (!isDrawing || !startPos) return;
        const stage = e.target.getStage();
        if (!stage) return;
        const pos = stage.getRelativePointerPosition();
        if (!pos) return;

		setCurrentRect({
			x: Math.min(startPos.x, pos.x),
			y: Math.min(startPos.y, pos.y),
			width: Math.abs(pos.x - startPos.x),
			height: Math.abs(pos.y - startPos.y),
		});
        forceUpdate();
	};

	const onMouseUp = () => {
		if (!isDrawing || !currentRect || currentRect.width < 2 || currentRect.height < 2) {
            cancel();
            return;
        }

		let elementData: any = {
			...currentRect,
			fill: { type: 'solid', color: '#D9D9D9' },
			stroke: { type: 'solid', color: '#000000' },
			strokeWidth: 1,
		};

		if (activeTool === 'rectangle') {
			elementData.element_type = 'shape';
			elementData.shape_type = 'rect';
		} else if (activeTool === 'ellipse') {
			elementData.element_type = 'shape';
			elementData.shape_type = 'ellipse';
		} else if (activeTool === 'frame') {
			elementData.element_type = 'frame';
            elementData.fill = { type: 'solid', color: '#FFFFFF' };
            elementData.stroke = null;
		}

		webSocketClient.sendCreateElement(elementData);
		cancel();
		dispatch({ type: 'SET_ACTIVE_TOOL', payload: { tool: 'select' } });
	};

    const cancel = () => {
        const wasDrawing = isDrawing;
        setIsDrawing(false);
		setStartPos(null);
		setCurrentRect(null);
        if (wasDrawing) {
            forceUpdate();
        }
    };

	const preview = isDrawing && currentRect ? (
        activeTool === 'ellipse' ? 
            <Ellipse
                x={currentRect.x + currentRect.width / 2}
                y={currentRect.y + currentRect.height / 2}
                radiusX={currentRect.width / 2}
                radiusY={currentRect.height / 2}
                stroke="#007aff" strokeWidth={1} dash={[4, 4]} listening={false}
            /> :
            <Rect
                {...currentRect}
                stroke="#007aff" strokeWidth={1} dash={[4, 4]} listening={false}
            />
	) : null;

	return { onMouseDown, onMouseMove, onMouseUp, cancel, preview, isDrawing };
};