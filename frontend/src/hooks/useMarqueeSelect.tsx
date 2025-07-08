// parsec-frontend/src/hooks/useMarqueeSelect.tsx

import { useState } from 'react';
import { useAppState } from '../state/AppStateContext';
import { KonvaEventObject } from 'konva/lib/Node';
import { Rect } from 'react-konva';

type RectBox = { x: number; y: number; width: number; height: number };

const haveIntersection = (r1: RectBox, r2: RectBox) => {
	return !(r2.x > r1.x + r1.width || r2.x + r2.width < r1.x || r2.y > r1.y + r1.height || r2.y + r2.height < r1.y);
};

export const useMarqueeSelect = (activeTool: string) => {
	const { state, dispatch } = useAppState();
	const { elements, selectedElementIds, groupEditingId } = state;
	const [isSelecting, setIsSelecting] = useState(false);
	const [marqueeRect, setMarqueeRect] = useState<RectBox | null>(null);

	const isMarqueeToolActive = activeTool === 'select';

	const onMouseDown = (e: KonvaEventObject<MouseEvent>) => {
		if (!isMarqueeToolActive || e.target !== e.target.getStage()) return;
		setIsSelecting(true);
		const pos = e.target.getStage()?.getRelativePointerPosition();
		if (!pos) return;
		setMarqueeRect({ x: pos.x, y: pos.y, width: 0, height: 0 });
		if (!e.evt.shiftKey) {
			dispatch({ type: 'SET_SELECTION', payload: { ids: [] } });
		}
	};

	const onMouseMove = (e: KonvaEventObject<MouseEvent>) => {
		if (!isSelecting) return;
		const pos = e.target.getStage()?.getRelativePointerPosition();
		if (!pos || !marqueeRect) return;
		setMarqueeRect({
			x: Math.min(marqueeRect.x, pos.x),
			y: Math.min(marqueeRect.y, pos.y),
			width: Math.abs(pos.x - marqueeRect.x),
			height: Math.abs(pos.y - marqueeRect.y),
		});
	};

	const onMouseUp = (e: KonvaEventObject<MouseEvent>) => {
		if (!isSelecting || !marqueeRect) return;
		const stage = e.target.getStage();
		if (stage) {
			const allNodes = stage.find('.element');
			const selectedNodes = allNodes.filter((node) => {
				if (node.getParent()?.className === 'Transformer') return false;
				
                // --- THIS IS THE FIX ---
                // Get the client rect RELATIVE TO THE STAGE, which puts it in the same
                // "world space" coordinate system as our marqueeRect.
				const box = node.getClientRect({ relativeTo: stage });
				return haveIntersection(marqueeRect, box);
			});

			const idsToSelect = new Set<string>();
			selectedNodes.forEach(node => {
				const element = elements[node.id()];
				if (element) {
					if (element.parentId && !groupEditingId) {
						idsToSelect.add(element.parentId);
					} else {
						idsToSelect.add(element.id);
					}
				}
			});

            if (e.evt.shiftKey) {
                const finalIds = new Set([...selectedElementIds, ...Array.from(idsToSelect)]);
                dispatch({ type: 'SET_SELECTION', payload: { ids: Array.from(finalIds) } });
            } else {
                dispatch({ type: 'SET_SELECTION', payload: { ids: Array.from(idsToSelect) } });
            }
		}
		setIsSelecting(false);
		setMarqueeRect(null);
	};

	const preview = marqueeRect ? (
		<Rect
			{...marqueeRect}
			fill="rgba(0, 122, 255, 0.15)"
			stroke="#007aff"
			strokeWidth={1 / (state.stageScale ?? 1)} // Adjust stroke width based on zoom
			strokeScaleEnabled={false}
			dash={[4, 4]}
			listening={false}
		/>
	) : null;

	return { onMouseDown, onMouseMove, onMouseUp, preview, isSelecting };
};