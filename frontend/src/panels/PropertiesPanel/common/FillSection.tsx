// src/panels/PropertiesPanel/common/FillSection.tsx
import React from 'react';
import { PropertyGroup } from './PropertyGroup';
import { PropertyRow, PropertyLabel, StringInput, ActionButton } from './CommonControls';
import type { Fill, ShapeElement, FrameElement, PathElement } from '../../../state/types';

type FillableElement = ShapeElement | FrameElement | PathElement;

interface FillSectionProps {
    element: FillableElement;
    onUpdate: (updates: Partial<FillableElement>) => void;
}

const ColorInput: React.FC<{ fill: Fill, onUpdate: (newFill: Fill) => void }> = ({ fill, onUpdate }) => {
    if (fill.type !== 'solid') return null; // For now, only handle solid colors
    return (
        <PropertyRow>
            <PropertyLabel>Color</PropertyLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <StringInput
                    type="color"
                    value={fill.color}
                    onChange={(e) => onUpdate({ ...fill, color: e.target.value })}
                    style={{ padding: 0, height: '28px', width: '28px' }}
                />
                <StringInput
                    type="text"
                    value={fill.color}
                    onChange={(e) => onUpdate({ ...fill, color: e.target.value })}
                />
            </div>
        </PropertyRow>
    );
};

export const FillSection: React.FC<FillSectionProps> = ({ element, onUpdate }) => {
    return (
        <>
            <PropertyGroup title="Fill">
                {element.fill ? (
                    <>
                        <ActionButton onClick={() => onUpdate({ fill: null })} style={{ marginBottom: '8px' }}>
                            Remove Fill
                        </ActionButton>
                        <ColorInput fill={element.fill} onUpdate={(newFill) => onUpdate({ fill: newFill })} />
                    </>
                ) : (
                    <ActionButton onClick={() => onUpdate({ fill: { type: 'solid', color: '#ffffff' } })}>
                        Add Fill
                    </ActionButton>
                )}
            </PropertyGroup>

            <PropertyGroup title="Stroke">
                {element.stroke ? (
                     <>
                        <ActionButton onClick={() => onUpdate({ stroke: null })} style={{ marginBottom: '8px' }}>
                            Remove Stroke
                        </ActionButton>
                        <PropertyRow>
                            <PropertyLabel>Width</PropertyLabel>
                            <StringInput
                                type="number"
                                value={String(element.strokeWidth)}
                                onChange={(e) => onUpdate({ strokeWidth: parseFloat(e.target.value) || 0 })}
                            />
                        </PropertyRow>
                        <ColorInput fill={element.stroke} onUpdate={(newStroke) => onUpdate({ stroke: newStroke })} />
                    </>
                ) : (
                    <ActionButton onClick={() => onUpdate({ stroke: { type: 'solid', color: '#888888' }, strokeWidth: 1 })}>
                        Add Stroke
                    </ActionButton>
                )}
            </PropertyGroup>
        </>
    );
};