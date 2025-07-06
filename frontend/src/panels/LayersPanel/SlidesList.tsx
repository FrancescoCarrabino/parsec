import React from 'react';
import { useDrop } from 'react-dnd';
import { useAppState } from '../../state/AppStateContext'; // To get theme colors for feedback
import { webSocketClient } from '../../api/websocket_client';
import { SlideItem } from './SlideItem';
import type { FrameElement } from '../../state/types';
import { ItemTypes } from './constants';
import styles from './LayersPanel.module.css'; // Use the same module

interface SlidesListProps {
    slides: FrameElement[];
}

interface DraggableLayerItem {
    id: string;
    elementType: string;
    presentationOrder: number | null;
}

export const SlidesList: React.FC<SlidesListProps> = ({ slides }) => {
    const { state } = useAppState(); // To access theme colors

    const [{ isOver }, drop] = useDrop<{ id: string; elementType: string; presentationOrder: number | null }, void, { isOver: boolean }>({
        accept: ItemTypes.LAYER,
        drop: (item: DraggableLayerItem) => {
            if (item.elementType === 'frame' && item.presentationOrder === null) {
                webSocketClient.sendUpdatePresentationOrder({
                    action: 'add',
                    frame_id: item.id,
                });
            }
        },
        canDrop: (item: DraggableLayerItem) => {
            // Only allow frames that are NOT already slides to be dropped
            return item.elementType === 'frame' && item.presentationOrder === null;
        },
        collect: monitor => ({ isOver: monitor.isOver() && monitor.canDrop() }),
    });

    const dropZoneClasses = clsx(styles.slidesDropZone, {
        [styles.isOver]: isOver,
    });

    return (
        <div ref={drop} className={dropZoneClasses}>
            {slides.length > 0 ? (
                // Pass slides list to SlideItem for context
                slides.map((frame, index) => (
                    <SlideItem key={frame.id} slides={slides} frame={frame} index={index} />
                ))
            ) : (
                <p className={styles.noSlidesMessage}>
                    Drag frames from the layers list above to add them to the presentation.
                </p>
            )}
        </div>
    );
};