// src/panels/PropertiesPanel/common/ArrangeSection.tsx
import React from 'react';
import { PropertyGroup } from './PropertyGroup';
import { ActionButton } from './CommonControls';
import { webSocketClient } from '../../../api/websocket_client';
import type { CanvasElement } from '../../../state/types'; // Import the main type

// --- THIS IS THE FIX: The component now expects the full element object ---
interface ArrangeSectionProps {
    element: CanvasElement;
}

export const ArrangeSection: React.FC<ArrangeSectionProps> = ({ element }) => {
    // The handler now has access to all of the element's properties.
    const handleArrange = (command: string) => {
        // The WebSocket call now correctly sends all required information.
        webSocketClient.sendReorderElement(element.id, command);
    };

    const gridStyle: React.CSSProperties = {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '8px'
    };
    
    const smallButtonStyle: React.CSSProperties = { padding: '4px' };

    return (
        <PropertyGroup title="Arrange">
            <div style={gridStyle}>
                <ActionButton onClick={() => handleArrange('BRING_FORWARD')} style={smallButtonStyle}>Forward</ActionButton>
                <ActionButton onClick={() => handleArrange('SEND_BACKWARD')} style={smallButtonStyle}>Backward</ActionButton>
                <ActionButton onClick={() => handleArrange('BRING_TO_FRONT')} style={smallButtonStyle}>To Front</ActionButton>
                <ActionButton onClick={() => handleArrange('SEND_TO_BACK')} style={smallButtonStyle}>To Back</ActionButton>
            </div>
        </PropertyGroup>
    );
};
