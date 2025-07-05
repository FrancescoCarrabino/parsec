// src/panels/LayersPanel/SlidesList.tsx
import React from 'react';
import { useDrop } from 'react-dnd';
import { webSocketClient } from '../../api/websocket_client';
import { SlideItem } from './SlideItem';
import type { FrameElement } from '../../state/types';
import { ItemTypes } from './constants';

interface SlidesListProps {
    slides: FrameElement[];
}

interface DraggableLayerItem {
    id: string;
    elementType: string;
    presentationOrder: number | null;
}

export const SlidesList: React.FC<SlidesListProps> = ({ slides }) => {

    const [{ isOver }, drop] = useDrop(() => ({
        accept: ItemTypes.LAYER,
        // --- THIS IS THE FIX ---
        drop: (item: DraggableLayerItem) => {
            // The drop handler no longer calculates state. It just sends the user's intent.
            webSocketClient.sendUpdatePresentationOrder({
                action: 'add',
                frame_id: item.id,
            });
        },
        // canDrop logic is still correct from the "Smart Item" fix.
        canDrop: (item: DraggableLayerItem) => {
            return item.elementType === 'frame' && item.presentationOrder === null;
        },
        collect: monitor => ({ isOver: monitor.isOver() && monitor.canDrop() }),
    }));

    const dropZoneStyle: React.CSSProperties = {
        flexGrow: 1,
        minHeight: '60px',
        padding: '4px',
        borderRadius: '4px',
        background: isOver ? 'rgba(0, 122, 255, 0.1)' : 'transparent',
        border: isOver ? '2px dashed #00aaff' : '2px dashed transparent',
        transition: 'all 150ms ease-in-out',
    };

    return (
        <div ref={drop} style={dropZoneStyle}>
            {slides.length > 0 ? (
                slides.map((frame, index) => (
                    // The SlideItem needs the full list to calculate reordering on its end.
                    <SlideItem key={frame.id} slides={slides} frame={frame} index={index} />
                ))
            ) : (
                <p style={{ textAlign: 'center', color: '#666', fontSize: '12px', padding: '10px' }}>
                    Drag frames from the layers list below to add them to the presentation.
                </p>
            )}
        </div>
    );
};