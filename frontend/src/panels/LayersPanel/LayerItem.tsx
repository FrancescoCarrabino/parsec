// src/panels/LayersPanel/LayerItem.tsx
import React, { useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { useAppState } from '../../state/AppStateContext';
import { webSocketClient } from '../../api/websocket_client';
import type { CanvasElement, FrameElement } from '../../state/types';
import { ItemTypes } from './constants';

interface LayerItemProps {
    element: CanvasElement;
    depth: number;
}

export const LayerItem: React.FC<LayerItemProps> = ({ element, depth }) => {
    const ref = useRef<HTMLDivElement>(null);
    const { state, dispatch } = useAppState();

    const isSlide = element.element_type === 'frame' && element.presentationOrder !== null;

    const [{ isDragging }, drag] = useDrag(() => ({
        // We only have one item type now. It's just a layer.
        type: ItemTypes.LAYER,
        item: {
            id: element.id,
            parentId: element.parentId,
            isSlide: isSlide,
        },
        collect: (monitor) => ({ isDragging: !!monitor.isDragging() })
    }));

    const [{ isOver, dropPosition }, drop] = useDrop<{ id: string, parentId: string | null, isSlide: boolean }, void, { isOver: boolean, dropPosition: 'above' | 'below' | 'on' | null }>({
        accept: ItemTypes.LAYER,
        hover(item, monitor) {
            if (!ref.current || item.id === element.id) return;
            
            const hoverBoundingRect = ref.current.getBoundingClientRect();
            const clientOffset = monitor.getClientOffset();
            if (!clientOffset) return;
            const hoverClientY = clientOffset.y - hoverBoundingRect.top;

            const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
            const isContainer = element.element_type === 'frame' || element.element_type === 'group';

            // If the target is a slide, we can only drop above or below to reorder.
            if (isSlide) {
                (monitor.getItem() as any).dropPosition = hoverClientY < hoverMiddleY ? 'above' : 'below';
            } 
            // If the target is a regular container, we can reparent.
            else if (isContainer && item.parentId !== element.id && hoverClientY > hoverBoundingRect.height * 0.25 && hoverClientY < hoverBoundingRect.height * 0.75) {
                (monitor.getItem() as any).dropPosition = 'on';
            } 
            // Otherwise, we are reordering z-index.
            else {
                (monitor.getItem() as any).dropPosition = hoverClientY < hoverMiddleY ? 'above' : 'below';
            }
        },
        drop: (item, monitor) => {
            const position = (monitor.getItem() as any).dropPosition;

            // CASE 1: Reordering slides.
            if (item.isSlide && isSlide) {
                webSocketClient.sendReorderSlide(item.id, element.id, position);
            }
            // CASE 2: Reparenting into a group or frame.
            else if (position === 'on') {
                webSocketClient.sendReparentElement(item.id, element.id);
            }
            // CASE 3: Reordering z-index of regular layers.
            else if (item.parentId === element.parentId) {
                webSocketClient.sendReorderLayer(item.id, element.id, position);
            }
        },
        canDrop: (item, monitor) => {
            // A slide can only be dropped on another slide.
            if (item.isSlide) return isSlide;
            // A regular layer can be dropped anywhere.
            return true;
        },
        collect: (monitor) => ({
            isOver: monitor.isOver() && monitor.canDrop(),
            dropPosition: monitor.isOver() && monitor.canDrop() ? (monitor.getItem() as any)?.dropPosition : null
        })
    });
    
    drag(drop(ref));

    const isSelected = state.selectedElementIds.includes(element.id);
    const handleSelect = (e: React.MouseEvent) => { e.stopPropagation(); dispatch({ type: 'SET_SELECTION', payload: { ids: [element.id] } }); };
    
    // UI Feedback
    const borderTop = isOver && dropPosition === 'above' ? '2px solid #00aaff' : '1px solid transparent';
    const borderBottom = isOver && dropPosition === 'below' ? '2px solid #00aaff' : '1px solid transparent';
    const backgroundColor = isOver && dropPosition === 'on' ? 'rgba(0, 255, 122, 0.2)' : isSelected ? 'rgba(0, 122, 255, 0.4)' : 'transparent';
    
    const itemContentStyle: React.CSSProperties = { padding: '4px 8px', marginLeft: `${depth * 20}px`, borderRadius: '4px', cursor: 'pointer', backgroundColor, opacity: isDragging ? 0.4 : 1, display: 'flex', alignItems: 'center', gap: '8px', borderTop, borderBottom, marginTop: '1px', marginBottom: '1px', borderLeft: '1px solid transparent', borderRight: '1px solid transparent' };
    const Icon = () => <span style={{ opacity: 0.8 }}>{element.element_type === 'frame' ? '🖼️' : element.element_type === 'group' ? '📁' : element.element_type === 'text' ? 'T' : '📄'}</span>;

    const presentationOrder = (element as FrameElement).presentationOrder;

    return (
        <div ref={ref} style={itemContentStyle} onMouseDown={handleSelect}>
            {/* NEW: Slide number badge */}
            {isSlide && (
                <span style={{ fontSize: '10px', background: '#007aff', color: 'white', borderRadius: '4px', padding: '1px 4px', minWidth: '12px', textAlign: 'center' }}>
                    {presentationOrder! + 1}
                </span>
            )}
            <Icon />
            <span>{element.name || element.id.substring(0, 8)}</span>
        </div>
    );
};