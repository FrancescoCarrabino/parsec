// parsec-frontend/src/hooks/useMarqueeSelect.ts
import { useState } from 'react';
import { useAppState } from '../state/AppStateContext';
import { KonvaEventObject } from 'konva/lib/Node';
import { Rect } from 'react-konva';

type RectBox = { x: number; y: number; width: number; height: number };

const haveIntersection = (r1: RectBox, r2: RectBox) => {
	return !(r2.x > r1.x + r1.width || r2.x + r2.width < r1.x || r2.y > r1.y + r1.height || r2.y + r2.height < r1.y);
};

// --- THIS IS THE FIX: The hook now accepts stageScale as an argument ---
export const useMarqueeSelect = (activeTool: string, isPanning: boolean, stageScale: number) => {
	const { state, dispatch } = useAppState();
	const { elements, groupEditingId } = state;
	const [isSelecting, setIsSelecting] = useState(false);
	const [marqueeRect, setMarqueeRect] = useState<RectBox | null>(null);

	const isMarqueeToolActive = activeTool === 'select' && !isPanning;

	const onMouseDown = (e: KonvaEventObject<MouseEvent>) => {
		if (!isMarqueeToolActive || e.target !== e.target.getStage()) return null;

		setIsSelecting(true);
		const pos = e.target.getStage()?.getRelativePointerPosition();
		if (!pos) return null;

		setMarqueeRect({ x: pos.x, y: pos.y, width: 0, height: 0 });
		dispatch({ type: 'SET_SELECTION', payload: { ids: [] } });
		return true;
	};

	const onMouseMove = (e: KonvaEventObject<MouseEvent>) => {
		if (!isSelecting || !isMarqueeToolActive) return null;

		const pos = e.target.getStage()?.getRelativePointerPosition();
		if (!pos || !marqueeRect) return null;
		
        const startX = marqueeRect.x;
        const startY = marqueeRect.y;
		setMarqueeRect({
			x: pos.x > startX ? startX : pos.x,
			y: pos.y > startY ? startY : pos.y,
			width: Math.abs(pos.x - startX),
			height: Math.abs(pos.y - startY),
		});
		return true;
	};

	const onMouseUp = (e: KonvaEventObject<MouseEvent>) => {
		if (!isSelecting || !isMarqueeToolActive || !marqueeRect) return null;
		
		const stage = e.target.getStage();
		if (stage) {
			const allNodes = stage.find('.element');
			
			const selectedNodes = allNodes.filter((node) => {
                if (node.getParent()?.className === 'Transformer') return false;
                return haveIntersection(marqueeRect, node.getClientRect());
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
			dispatch({ type: 'SET_SELECTION', payload: { ids: Array.from(idsToSelect) } });
		}

		setIsSelecting(false);
		setMarqueeRect(null);
		return true;
	};

	// --- THIS IS THE FIX: The preview JSX now correctly uses the stageScale prop ---
	const preview = isSelecting && marqueeRect ? (
		<Rect
			{...marqueeRect}
			fill="rgba(0, 122, 255, 0.15)"
			stroke="#007aff"
			strokeWidth={1 / stageScale} // Correctly uses the scale from props
			strokeScaleEnabled={false}
			dash={[4, 4]}
			listening={false}
		/>
	) : null;

	return {
		onMouseDown,
		onMouseMove,
		onMouseUp,
		preview,
		isSelecting,
	};
};