// src/panels/PropertiesPanel/common/TransformSection.tsx
import React from 'react';
import { PropertyGroup, PropertyRow, PropertyLabel, StringInput } from './CommonControls';
import type { CanvasElement } from '../../../state/types';
import styles from '../PropertiesPanel.module.css'; // Import the shared module

interface TransformSectionProps {
    element: CanvasElement;
    onUpdate: (updates: Partial<CanvasElement>) => void;
}

// Renamed from NumberInput to be more generic if needed, but purpose is number input
const DimensionInput: React.FC<{ label: string, value: number | string | undefined | null, onUpdate: (val: number) => void, step?: string }> = ({ label, value, onUpdate, step }) => (
    // Each DimensionInput is a PropertyRow, placed by the parent grid
    <PropertyRow>
        <PropertyLabel>{label}</PropertyLabel>
        <StringInput type="number" value={String(value ?? '')} onChange={(e) => onUpdate(parseFloat(e.target.value) || 0)} step={step} />
    </PropertyRow>
);

export const TransformSection: React.FC<TransformSectionProps> = ({ element, onUpdate }) => {
    return (
        <PropertyGroup title="Transform">
            {/* Name Input - A single PropertyRow */}
            <PropertyRow>
                <PropertyLabel>Name</PropertyLabel>
                <StringInput type="text" value={element.name || ''} onChange={(e) => onUpdate({ name: e.target.value })} />
            </PropertyRow>
            {/* X input - A single PropertyRow */}
            <DimensionInput label="X" value={element.x} onUpdate={(val) => onUpdate({ x: val })} />
            {/* Y input - A single PropertyRow */}
            <DimensionInput label="Y" value={element.y} onUpdate={(val) => onUpdate({ y: val })} />
            {/* Width input - A single PropertyRow */}
            <DimensionInput label="Width" value={element.width} onUpdate={(val) => onUpdate({ width: val })} />
            {/* Height input - A single PropertyRow */}
             <DimensionInput label="Height" value={element.height} onUpdate={(val) => onUpdate({ height: val })} />
             {/* Rotation input - A single PropertyRow */}
            <DimensionInput label="Rotation" value={element.rotation} onUpdate={(val) => onUpdate({ rotation: val })} step="1" />
        </PropertyGroup>
    );
};