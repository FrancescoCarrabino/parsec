// src/panels/PropertiesPanel/elementSections/FrameProperties.tsx
import React from 'react';
import { PropertyGroup, PropertyRow, PropertyLabel, StringInput } from '../common/CommonControls';
import type { FrameElement } from '../../../state/types';
import styles from '../PropertiesPanel.module.css'; // Import the shared module

// Assuming SpeakerNotesSection is handled elsewhere (like index.tsx)

interface FramePropertiesProps {
    element: FrameElement;
    onUpdate: (updates: Partial<FrameElement>) => void;
}

export const FrameProperties: React.FC<FramePropertiesProps> = ({ element, onUpdate }) => {
    return (
        <PropertyGroup title="Frame Options">
            <PropertyRow>
                <PropertyLabel>Clip content</PropertyLabel>
                {/* Checkbox styling needs attention - keeping basic inline style for now unless you refactor checkboxes */}
                <input
                    type="checkbox"
                    checked={element.clipsContent ?? false} // Default to false if undefined
                    onChange={(e) => onUpdate({ clipsContent: e.target.checked })}
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
            </PropertyRow>
            <PropertyRow>
                <PropertyLabel>Corner Radius</PropertyLabel>
                <StringInput
                    type="number"
                    value={String(element.cornerRadius ?? 0)} // Default to 0 if undefined
                    onChange={(e) => onUpdate({ cornerRadius: parseFloat(e.target.value) || 0 })}
                />
            </PropertyRow>
            {/* Speaker Notes is handled separately in index.tsx */}
        </PropertyGroup>
    );
};