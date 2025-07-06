// src/panels/PropertiesPanel/common/ArrangeSection.tsx
import React from 'react';
import { PropertyGroup, ActionButton } from './CommonControls';
import { webSocketClient } from '../../../api/websocket_client';
import type { CanvasElement } from '../../../state/types';
import { ChevronsUp, ChevronsDown, Upload, Download } from 'lucide-react'; // Import icons
import styles from '../PropertiesPanel.module.css'; // Import the shared module

interface ArrangeSectionProps {
    element: CanvasElement;
}

export const ArrangeSection: React.FC<ArrangeSectionProps> = ({ element }) => {
    const handleArrange = (command: string) => {
        // The WebSocket call now correctly sends all required information.
        webSocketClient.sendReorderElement(element.id, command);
    };

    return (
        <PropertyGroup title="Order"> {/* Changed title to Order */}
             <div className={styles.actionGrid}> {/* Use the actionGrid class */}
                <ActionButton onClick={() => handleArrange('BRING_FORWARD')}>
                    <ChevronsUp size={18} /> Forward
                </ActionButton>
                <ActionButton onClick={() => handleArrange('SEND_BACKWARD')}>
                    <ChevronsDown size={18} /> Backward
                </ActionButton>
                <ActionButton onClick={() => handleArrange('BRING_TO_FRONT')}>
                    <Upload size={18} /> To Front
                </ActionButton>
                <ActionButton onClick={() => handleArrange('SEND_TO_BACK')}>
                    <Download size={18} /> To Back
                </ActionButton>
            </div>
        </PropertyGroup>
    );
};