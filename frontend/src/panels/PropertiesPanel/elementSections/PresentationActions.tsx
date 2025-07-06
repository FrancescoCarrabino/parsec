// src/panels/PropertiesPanel/elementSections/PresentationActions.tsx
import React from 'react';
import { useAppState } from '../../../state/AppStateContext';
import { webSocketClient } from '../../../api/websocket_client';
import { PropertyGroup, ActionButton } from '../common/CommonControls';
import type { FrameElement } from '../../../state/types';
import styles from '../PropertiesPanel.module.css'; // Import the shared module

// This component only makes sense when a FrameElement is selected
interface PresentationActionsProps {
    element: FrameElement;
}

export const PresentationActions: React.FC<PresentationActionsProps> = ({ element }) => {
    const { state } = useAppState(); // Still need state to check other slides
    const isSlide = element.presentationOrder !== null;

    const handleAddToPresentation = () => {
        // Get all frames that are already slides
        const slides = Object.values(state.elements)
            .filter(el => el.element_type === 'frame' && (el as FrameElement).presentationOrder !== null) as FrameElement[];
        
        // Ensure the element isn't already a slide (shouldn't happen if !isSlide, but defensive)
        if (slides.some(s => s.id === element.id)) return;

        // Sort existing slides by order to determine where to add the new one
        const currentSlideIds = slides.sort((a, b) => a.presentationOrder! - b.presentationOrder!).map(s => s.id);
        // Append the current element's ID to the end of the ordered list
        const newOrderIds = [...currentSlideIds, element.id];
        
        // Use the 'set' action to provide the complete new order to the backend
        webSocketClient.sendUpdatePresentationOrder({ action: 'set', ordered_frame_ids: newOrderIds });
    };
  
    const handleRemoveFromPresentation = () => {
        // Get all frames that are already slides
        const slides = Object.values(state.elements)
            .filter(el => el.element_type === 'frame' && (el as FrameElement).presentationOrder !== null) as FrameElement[];
        
        // Filter out the selected element and send the new list of IDs.
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