// src/panels/PropertiesPanel/elementSections/GroupingActions.tsx
import React from 'react';
import { PropertyGroup, ActionButton } from '../common/CommonControls';
import { webSocketClient } from '../../../api/websocket_client';
import type { CanvasElement } from '../../../state/types';
import styles from '../PropertiesPanel.module.css'; // Import the shared module
import { Brackets } from 'lucide-react'; // Import icon
import clsx from 'clsx'; // Import clsx for disabled state

interface GroupingActionsProps {
    selectedElement: CanvasElement | null; // Single selected element (for Ungroup check)
    selectedElementIds: string[]; // All selected element IDs (for Group check)
}

export const GroupingActions: React.FC<GroupingActionsProps> = ({ selectedElement, selectedElementIds }) => {
    const handleGroup = () => {
        if (selectedElementIds.length > 1) {
            webSocketClient.sendGroupElements(selectedElementIds);
        }
    };

    const handleUngroup = () => {
        // Ungroup works on the single selected element if it's a group or frame
        if (selectedElement && (selectedElement.element_type === 'group' || selectedElement.element_type === 'frame')) {
            webSocketClient.sendUngroupElement(selectedElement.id);
        }
    };

    // Logic to determine button states
    const canGroup = selectedElementIds.length > 1;
    // Can ungroup if exactly ONE element is selected AND it's a group or frame
    const canUngroup = selectedElementIds.length === 1 && selectedElement && (selectedElement.element_type === 'group' || selectedElement.element_type === 'frame');

    // Determine which button(s) to show. We show Group if multiple are selected.
    // We show Ungroup if exactly one Group/Frame is selected.
    // If neither, show nothing for this section.
    if (!canGroup && !canUngroup) {
        // Only show the group/ungroup section if the actions are potentially possible
        // return null; // Or return an empty fragment <> </>
    }


    return (
        <PropertyGroup title="Arrangement"> {/* Consistent title */}
            <div className={styles.actionGrid}> {/* Use the actionGrid class for layout */}
                 {/* Show Group button if applicable */}
                 <ActionButton onClick={handleGroup} disabled={!canGroup}>
                      <Brackets size={18} /> Group Selection
                  </ActionButton>

                 {/* Show Ungroup button if applicable */}
                 {/* Note: In most UIs, you only see Ungroup when a group/frame is selected,
                          and Group when multiple are selected. They are often mutually exclusive.
                          Your current UI shows Group when multiple are selected and Ungroup
                          when a single group/frame is selected. This matches your current logic. */}
                  <ActionButton onClick={handleUngroup} disabled={!canUngroup}>
                      <Brackets size={18} /> Ungroup
                  </ActionButton>
            </div>
        </PropertyGroup>
    );
};