// src/panels/PropertiesPanel/common/TransformSection.tsx
import React from 'react';
import { PropertyGroup } from './PropertyGroup';
import { PropertyRow, PropertyLabel, StringInput } from './CommonControls';
import type { CanvasElement } from '../../../state/types';

interface TransformSectionProps {
    element: CanvasElement;
    onUpdate: (updates: Partial<CanvasElement>) => void;
}

const NumberInput: React.FC<{ label: string, value: number, onUpdate: (val: number) => void }> = ({ label, value, onUpdate }) => (
    <PropertyRow>
        <PropertyLabel>{label}</PropertyLabel>
        <StringInput type="number" value={String(value)} onChange={(e) => onUpdate(parseFloat(e.target.value) || 0)} />
    </PropertyRow>
);

export const TransformSection: React.FC<TransformSectionProps> = ({ element, onUpdate }) => {
    return (
        <PropertyGroup title="Transform">
            <PropertyRow>
                <PropertyLabel>Name</PropertyLabel>
                <StringInput type="text" value={element.name} onChange={(e) => onUpdate({ name: e.target.value })} />
            </PropertyRow>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <NumberInput label="X" value={element.x} onUpdate={(val) => onUpdate({ x: val })} />
                <NumberInput label="Y" value={element.y} onUpdate={(val) => onUpdate({ y: val })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <NumberInput label="Width" value={element.width} onUpdate={(val) => onUpdate({ width: val })} />
                <NumberInput label="Height" value={element.height} onUpdate={(val) => onUpdate({ height: val })} />
            </div>
            <NumberInput label="Rotation" value={element.rotation} onUpdate={(val) => onUpdate({ rotation: val })} />
        </PropertyGroup>
    );
};