// src/panels/PropertiesPanel/elementSections/TextProperties.tsx
import React from 'react';
import { PropertyGroup } from '../common/PropertyGroup';
import { PropertyRow, PropertyLabel, StringInput } from '../common/CommonControls';
import type { TextElement } from '../../../state/types';

interface TextPropertiesProps {
    element: TextElement;
    onUpdate: (updates: Partial<TextElement>) => void;
}

export const TextProperties: React.FC<TextPropertiesProps> = ({ element, onUpdate }) => {
    // This is the same logic from your old TextPropertiesSection
    return (
        <PropertyGroup title="Typography">
            <PropertyRow>
                <PropertyLabel>Font</PropertyLabel>
                {/* A proper font dropdown would go here */}
                <StringInput value={element.fontFamily} onChange={(e) => onUpdate({ fontFamily: e.target.value })} />
            </PropertyRow>
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <PropertyRow>
                    <PropertyLabel>Weight</PropertyLabel>
                    <StringInput type="number" step={100} value={element.fontWeight} onChange={(e) => onUpdate({ fontWeight: parseInt(e.target.value) || 400 })} />
                </PropertyRow>
                <PropertyRow>
                    <PropertyLabel>Size</PropertyLabel>
                    <StringInput type="number" value={element.fontSize} onChange={(e) => onUpdate({ fontSize: parseInt(e.target.value) || 16 })} />
                </PropertyRow>
            </div>
            {/* ... other text properties like alignment, letter spacing, etc. would go here */}
        </PropertyGroup>
    );
};