// src/panels/LayersPanel/SlideItem.tsx
import React, { useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { useAppState } from '../../state/AppStateContext';
import { webSocketClient } from '../../api/websocket_client';
import type { FrameElement } from '../../state/types';
import { ItemTypes } from './constants';

interface SlideItemProps {
    frame: FrameElement;
    index: number;
}

export const SlideItem: React.FC<SlideItemProps> = ({ frame, index }) => {
    const ref = useRef<HTMLDivElement>(null);
    const { state, dispatch } = useAppState();
    
    const [{ isDragging }, drag] = useDrag(() => ({
        type: ItemTypes.SLIDE,
        item: { id: frame.id },
    }));

    const [{ isOver, dropPosition }, drop] = useDrop<{ id: string }, void, { isOver: boolean, dropPosition: 'above' | 'below' | null }>({
        accept: ItemTypes.SLIDE, // It ONLY accepts other slides.
        hover(item, monitor) {
            if (!ref.current || item.id === frame.id) return;
            const hoverBoundingRect = ref.current.getBoundingClientRect();
            const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
            const clientOffset = monitor.getClientOffset();
            if (!clientOffset) return;
            const hoverClientY = clientOffset.y - hoverBoundingRect.top;
            (monitor.getItem() as any).dropPosition = hoverClientY < hoverMiddleY ? 'above' : 'below';
        },
        drop: (item, monitor) => {
            if (item.id === frame.id) return;
            const position = (monitor.getItem() as any).dropPosition;
            webSocketClient.sendReorderSlide(item.id, frame.id, position);
        },
        collect: monitor => ({
            isOver: monitor.isOver() && monitor.canDrop(),
            dropPosition: (monitor.isOver() && monitor.canDrop()) ? (monitor.getItem() as any)?.dropPosition : null
        })
    });

    drag(drop(ref));

    const isSelected = state.selectedElementIds.includes(frame.id);
    const handleSelect = (e: React.MouseEvent) => { e.stopPropagation(); dispatch({ type: 'SET_SELECTION', payload: { ids: [frame.id] } }); };

    const borderTop = isOver && dropPosition === 'above' ? '2px solid #00aaff' : '2px solid transparent';
    const borderBottom = isOver && dropPosition === 'below' ? '2px solid #00aaff' : '2px solid transparent';
    const itemStyle: React.CSSProperties = { padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', backgroundColor: isSelected ? 'rgba(0, 122, 255, 0.4)' : 'transparent', opacity: isDragging ? 0.4 : 1, display: 'flex', alignItems: 'center', gap: '8px', borderTop, borderBottom, marginTop: '1px', marginBottom: '1px' };
    
    return (
        <div ref={ref} style={itemStyle} onMouseDown={handleSelect}>
            <span style={{ color: '#888', minWidth: '16px', textAlign: 'right' }}>{index + 1}</span>
            <div style={{ width: '32px', height: '24px', background: '#444', border: '1px solid #666', borderRadius: '2px' }} />
            <span>{frame.name || frame.id.substring(0, 8)}</span>
        </div>
    );
};