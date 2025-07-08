import React, { useRef, useMemo, useState, useEffect } from 'react'; // Added useState and useEffect
import { useDrag, useDrop } from 'react-dnd';
import { useAppState } from '../../state/AppStateContext';
import { webSocketClient } from '../../api/websocket_client';
import type { CanvasElement, FrameElement } from '../../state/types';
import { ItemTypes } from './constants';
import styles from './LayersPanel.module.css';
import clsx from 'clsx';

// Import Lucide Icons
import {
    MousePointer, Type, Square, Circle, PenTool, Brackets, FileText, Image,
    MoreHorizontal // Placeholder for generic path icon
} from 'lucide-react';

interface LayerItemProps {
    element: CanvasElement;
    depth: number;
}

// Helper to map element types to Lucide icons
const ElementIconMap: Record<CanvasElement['element_type'], React.ElementType> = {
    text: Type,
    rectangle: Square,
    ellipse: Circle,
    path: MoreHorizontal, // Or use PenTool if you prefer
    image: Image,
    frame: Brackets, // Representing a container/frame
    group: Brackets, // Group can also use Brackets or a Folder icon
    component_instance: Brackets, // Component instance might use Brackets or a specific component icon
    // Add other types if they exist
};

export const LayerItem: React.FC<LayerItemProps> = ({ element, depth }) => {
    const ref = useRef<HTMLDivElement>(null);
    const { state, dispatch } = useAppState();
    const { selectedElementIds } = state; 
    
    const [indentationWidth, setIndentationWidth] = useState<number>(16); // Default value

    useEffect(() => {
        const computedStyle = getComputedStyle(document.documentElement);
        const space4 = computedStyle.getPropertyValue('--space-4').trim();
        setIndentationWidth(parseInt(space4 || '16', 10));
    }, []);

    const isSlide = element.element_type === 'frame' && (element as FrameElement).presentationOrder !== null;

    const [{ isDragging }, drag] = useDrag(() => ({
        type: ItemTypes.LAYER,
        item: {
            id: element.id,
            parentId: element.parentId,
            isSlide: isSlide,
            elementType: element.element_type,
            presentationOrder: isSlide ? (element as FrameElement).presentationOrder : null,
        },
        collect: (monitor) => ({ isDragging: !!monitor.isDragging() })
    }));

    const [{ isOver, dropPosition }, drop] = useDrop<{ id: string, parentId: string | null, isSlide: boolean, elementType: string, presentationOrder: number | null }, void, { isOver: boolean, dropPosition: 'above' | 'below' | 'on' | null }>({
        accept: ItemTypes.LAYER,
        hover(item, monitor) {
            if (!ref.current || item.id === element.id) return;
            
            const hoverBoundingRect = ref.current.getBoundingClientRect();
            const clientOffset = monitor.getClientOffset();
            if (!clientOffset) return;
            const hoverClientY = clientOffset.y - hoverBoundingRect.top;

            const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
            const isTargetContainer = element.element_type === 'frame' || element.element_type === 'group';

            let calculatedDropPosition: 'above' | 'below' | 'on' | null = null;

            if (item.isSlide) { // Source item is a slide
                calculatedDropPosition = hoverClientY < hoverMiddleY ? 'above' : 'below';
            } else if (isTargetContainer && item.elementType !== 'frame' && item.presentationOrder === null) { // Target is container, source is not a slide
                if (hoverClientY > hoverBoundingRect.height * 0.25 && hoverClientY < hoverBoundingRect.height * 0.75) {
                    calculatedDropPosition = 'on';
                } else {
                    calculatedDropPosition = hoverClientY < hoverMiddleY ? 'above' : 'below';
                }
            } else if (!item.isSlide && !isSlide) { // Both are regular layers, reorder
                calculatedDropPosition = hoverClientY < hoverMiddleY ? 'above' : 'below';
            }
            
            (monitor.getItem() as any).dropPosition = calculatedDropPosition;
        },
        drop: (item, monitor) => {
            const position = (monitor.getItem() as any).dropPosition;

            if (position === 'on') {
                webSocketClient.sendReparentElement(item.id, element.id);
            } else if (position === 'above' || position === 'below') {
                if (item.parentId === element.parentId && !item.isSlide) {
                     webSocketClient.sendReorderLayer(item.id, element.id, position);
                } else if (item.isSlide && isSlide) {
                    // Reordering slides handled by SlideItem
                }
            }
        },
        canDrop: (item) => {
            if (item.isSlide) {
                return isSlide || (element.element_type === 'frame' || element.element_type === 'group');
            }
            return true;
        },
        collect: (monitor) => ({
            isOver: monitor.isOver() && monitor.canDrop(),
            dropPosition: monitor.isOver() && monitor.canDrop() ? (monitor.getItem() as any)?.dropPosition : null
        })
    });
    
    drag(drop(ref));

    const isSelected = state.selectedElementIds.includes(element.id);
    const handleSelect = (e: React.MouseEvent) => {
        e.stopPropagation(); // Keep this to prevent unintended side-effects

        // Check for Shift or Ctrl/Cmd (metaKey for Mac)
        const isMultiSelect = e.shiftKey || e.ctrlKey || e.metaKey;

        if (isMultiSelect) {
            // --- TOGGLE BEHAVIOR ---
            if (isSelected) {
                // It's already selected, so remove it.
                dispatch({ type: 'REMOVE_FROM_SELECTION', payload: { id: element.id } });
            } else {
                // It's not selected, so add it.
                dispatch({ type: 'ADD_TO_SELECTION', payload: { id: element.id } });
            }
        } else {
            // --- NORMAL CLICK BEHAVIOR ---
            // Replace the entire selection with just this item.
            // (Only dispatch if the selection is actually changing)
            if (!isSelected || selectedElementIds.length > 1) {
                dispatch({ type: 'SET_SELECTION', payload: { ids: [element.id] } });
            }
        }
    };
    
    const layerClasses = clsx(styles.layerItem, {
        [styles.dragging]: isDragging,
        [styles.isSelected]: isSelected,
        [styles.isOverAbove]: isOver && dropPosition === 'above',
        [styles.isOverBelow]: isOver && dropPosition === 'below',
        [styles.isOverOn]: isOver && dropPosition === 'on',
    });

    const dynamicItemStyles: React.CSSProperties = {
        marginLeft: `${depth * indentationWidth}px`,
        borderTop: (isOver && dropPosition === 'above') ? `2px solid ${state.theme?.accentPrimary || '#00aaff'}` : '2px solid transparent',
        borderBottom: (isOver && dropPosition === 'below') ? `2px solid ${state.theme?.accentPrimary || '#00aaff'}` : '2px solid transparent',
    };
    
    // Dynamically get the icon component based on element type
    const IconComponent = ElementIconMap[element.element_type] || FileText; // Fallback to FileText

    const presentationOrder = (element as FrameElement).presentationOrder;

    return (
        <div ref={ref} className={layerClasses} style={dynamicItemStyles} onMouseDown={handleSelect}>
            {isSlide && (
                <span className={styles.slideNumberBadge}>
                    {presentationOrder! + 1}
                </span>
            )}
            <div className={styles.layerIconContainer}>
                <IconComponent size={18} /> {/* Use Lucide component */}
            </div>
            <span className={styles.layerName}>{element.name || element.id.substring(0, 8)}</span>
        </div>
    );
};