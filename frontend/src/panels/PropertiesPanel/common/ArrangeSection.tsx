// src/panels/PropertiesPanel/common/ArrangeSection.tsx
import React from 'react';
import { PropertyGroup } from '../common/PropertyGroup';
import { ActionButton } from '../common/CommonControls';
import { webSocketClient } from '../../../api/websocket_client';

interface ArrangeSectionProps {
    elementId: string;
}

export const ArrangeSection: React.FC<ArrangeSectionProps> = ({ elementId }) => {
    const handleArrange = (command: string) => {
        webSocketClient.sendReorderElement(elementId, command);
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