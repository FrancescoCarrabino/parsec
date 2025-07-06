import React, { useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { useAppState } from '../../state/AppStateContext';
import { webSocketClient } from '../../api/websocket_client';
import type { FrameElement } from '../../state/types';
import { ItemTypes } from './constants';
import styles from './LayersPanel.module.css'; // Use the same module
import clsx from 'clsx';

interface SlideItemProps {
    frame: FrameElement;
    index: number;
    slides: FrameElement[];
}

interface DraggableSlideItem {
    id: string;
    slides: FrameElement[];
}

export const SlideItem: React.FC<SlideItemProps> = ({ frame, index, slides }) => {
    const ref = useRef<HTMLDivElement>(null);
    const { state, dispatch } = useAppState();
    
    const [{ isDragging }, drag] = useDrag(() => ({
        type: ItemTypes.SLIDE,
        item: { id: frame.id, slides: slides },
        collect: (monitor) => ({ isDragging: !!monitor.isDragging() })
    }));

    const [{ isOver, dropPosition }, drop] = useDrop<{ id: string, slides: FrameElement[] }, void, { isOver: boolean, dropPosition: 'above' | 'below' | null }>({
        accept: ItemTypes.SLIDE,
        hover(item, monitor) {
            if (!ref.current || item.id === frame.id) return;
            const hoverBoundingRect = ref.current.getBoundingClientRect();
            const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
            const clientOffset = monitor.getClientOffset();
            if (!clientOffset) return;
            const hoverClientY = clientOffset.y - hoverBoundingRect.top;
            const calculatedDropPosition = hoverClientY < hoverMiddleY ? 'above' : 'below';
            (monitor.getItem() as any).dropPosition = calculatedDropPosition;
        },
        drop: (item, monitor) => {
            if (item.id === frame.id) return;
            const position = (monitor.getItem() as any).dropPosition;
            webSocketClient.sendReorderSlide(item.id, frame.id, position);
        },
        canDrop: (item) => item.id !== frame.id,
        collect: monitor => ({
            isOver: monitor.isOver() && monitor.canDrop(),
            dropPosition: (monitor.isOver() && monitor.canDrop()) ? (monitor.getItem() as any)?.dropPosition : null
        })
    });

    drag(drop(ref));

    const isSelected = state.selectedElementIds.includes(frame.id);
    const handleSelect = (e: React.MouseEvent) => { 
        e.stopPropagation(); 
        dispatch({ type: 'SET_SELECTION', payload: { ids: [frame.id] } }); 
    };

    const slideItemClasses = clsx(styles.slideItem, {
        [styles.dragging]: isDragging,
        [styles.isSelected]: isSelected,
        [styles.isOverAbove]: isOver && dropPosition === 'above',
        [styles.isOverBelow]: isOver && dropPosition === 'below',
    });

    const itemContentStyle: React.CSSProperties = {
        borderTop: (isOver && dropPosition === 'above') ? `2px solid ${state.theme?.accentPrimary || '#00aaff'}` : '2px solid transparent',
        borderBottom: (isOver && dropPosition === 'below') ? `2px solid ${state.theme?.accentPrimary || '#00aaff'}` : '2px solid transparent',
    };
    
    return (
        <div ref={ref} className={slideItemClasses} style={itemContentStyle} onMouseDown={handleSelect}>
            <span className={styles.slideNumber}>{index + 1}</span>
            <div className={styles.slidePreview} />
            <span className={styles.layerName}>{frame.name || frame.id.substring(0, 8)}</span> {/* Reused layerName class */}
        </div>
    );
};