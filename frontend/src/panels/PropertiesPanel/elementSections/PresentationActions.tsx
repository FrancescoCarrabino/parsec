// src/panels/PropertiesPanel/elementSections/PresentationActions.tsx
import React from 'react';
import { useAppState } from '../../../state/AppStateContext';
import { webSocketClient } from '../../../api/websocket_client';
import { PropertyGroup } from '../common/PropertyGroup';
import { ActionButton } from '../common/CommonControls';
import type { FrameElement } from '../../../state/types';

interface PresentationActionsProps {
    element: FrameElement;
}

export const PresentationActions: React.FC<PresentationActionsProps> = ({ element }) => {
    const { state } = useAppState();
    const isSlide = element.presentationOrder !== null;

    const handleAddToPresentation = () => {
        const slides = Object.values(state.elements)
            .filter(el => el.element_type === 'frame' && (el as FrameElement).presentationOrder !== null) as FrameElement[];
        slides.sort((a, b) => a.presentationOrder! - b.presentationOrder!);
        
        // Append the current element's ID to the end of the list
        const newOrderIds = slides.map(s => s.id).concat(element.id);
        
        // Use the 'set' action to provide the complete new order
        webSocketClient.sendUpdatePresentationOrder({ action: 'set', ordered_frame_ids: newOrderIds });
    };
  
    const handleRemoveFromPresentation = () => {
        const slides = Object.values(state.elements)
            .filter(el => el.element_type === 'frame' && (el as FrameElement).presentationOrder !== null) as FrameElement[];
        slides.sort((a, b) => a.presentationOrder! - b.presentationOrder!);
        
        // Filter out the selected element and send the new list.
        const newOrderIds = slides.map(s => s.id).filter(id => id !== element.id);

        webSocketClient.sendUpdatePresentationOrder({ action: 'set', ordered_frame_ids: newOrderIds });
    };

    return (
        <PropertyGroup title="Presentation">
            {isSlide ? (
                <ActionButton onClick={handleRemoveFromPresentation}>Remove from Presentation</ActionButton>
            ) : (
                <ActionButton onClick={handleAddToPresentation}>Add to Presentation</ActionButton>
            )}
        </PropertyGroup>
    );
};