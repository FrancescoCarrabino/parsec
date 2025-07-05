// src/panels/PropertiesPanel/elementSections/GroupingActions.tsx
import React from 'react';
import { useAppState } from '../../../state/AppStateContext';
import { webSocketClient } from '../../../api/websocket_client';
import { PropertyGroup } from '../common/PropertyGroup';
import { ActionButton } from '../common/CommonControls';
import type { CanvasElement } from '../../../state/types';

interface GroupingActionsProps {
    selectedElement: CanvasElement | null;
    selectedElementIds: string[];
}

export const GroupingActions: React.FC<GroupingActionsProps> = ({ selectedElement, selectedElementIds }) => {
    const handleGroup = () => {
        if (selectedElementIds.length > 1) {
            webSocketClient.sendGroupElements(selectedElementIds);
        }
    };

    const handleUngroup = () => {
        if (selectedElement) {
            webSocketClient.sendUngroupElement(selectedElement.id);
        }
    };

    const canGroup = selectedElementIds.length > 1;
    const canUngroup = selectedElement && (selectedElement.element_type === 'group' || selectedElement.element_type === 'frame');

    return (
        <PropertyGroup title="Grouping">
            {canUngroup ? (
                <ActionButton onClick={handleUngroup}>Ungroup (Ctrl+Shift+G)</ActionButton>
            ) : (
                <ActionButton onClick={handleGroup} disabled={!canGroup} style={!canGroup ? { cursor: 'not-allowed', opacity: 0.5 } : {}}>
                    Group Selection (Ctrl+G)
                </ActionButton>
            )}
        </PropertyGroup>
    );
};