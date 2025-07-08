// parsec-frontend/src/hooks/useDrawingTool.ts
import React, { useState } from 'react';
import { useAppState } from '../state/AppStateContext';
import { webSocketClient } from '../api/websocket_client';
import { KonvaEventObject } from 'konva/lib/Node';
import { Vector2d } from 'konva/lib/types';
import { Rect, Ellipse } from 'react-konva';
import type { TextElement } from '../state/types'; // Import TextElement type

// Define default properties for a new text element
const DEFAULT_TEXT_PROPERTIES: Omit<TextElement, keyof BaseElement | 'element_type'> = {
    content: 'Type something...',
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: 400,
    fontColor: '#000000', // Default to black, or consider a lighter color like #FFFFFF if your theme is dark
    letterSpacing: 0,
    lineHeight: 1.2,
    align: 'left',
    verticalAlign: 'top',
    // Note: BaseElement properties like id, x, y, rotation, width, height, zIndex, isVisible, parentId, name are set elsewhere.
};


export const useDrawingTool = () => {
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
            // *** FIX IS HERE ***
            // When creating a new text element, explicitly set all default text properties.
            webSocketClient.sendCreateElement({
                element_type: 'text',
                x: pos.x,
                y: pos.y,
                // Spread the default properties
                ...DEFAULT_TEXT_PROPERTIES,
                // Base properties like id, name, width, height, zIndex, etc., are typically added by the backend or a factory function.
                // For now, we assume backend adds common base properties.
                // If frontend creates it fully, add id, name, zIndex etc. here too.
            } as TextElement); // Cast to TextElement to help TypeScript understand the shape
            
            dispatch({ type: 'SET_ACTIVE_TOOL', payload: { tool: 'select' } }); // Switch back to select tool after creating text
            return;
        }

        // Logic for drawing shapes (rect, ellipse, frame)
		setStartPos(pos);
		setCurrentRect({ x: pos.x, y: pos.y, width: 0, height: 0 });
		setIsDrawing(true);
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
	};

	const onMouseUp = () => {
		if (!isDrawing || !currentRect || currentRect.width < 2 || currentRect.height < 2) {
            cancel();
            return;
        }

		let elementData: any = {
			...currentRect, // x, y, width, height
			// Default stroke and fill for shapes are handled here
			fill: { type: 'solid', color: '#D9D9D9' }, // Default light gray fill
			stroke: { type: 'solid', color: '#000000' }, // Default black stroke
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
            elementData.fill = { type: 'solid', color: '#FFFFFF' }; // Default white fill for frames
            elementData.stroke = null; // No default stroke for frames
            elementData.clipsContent = true; // Frames usually clip content
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