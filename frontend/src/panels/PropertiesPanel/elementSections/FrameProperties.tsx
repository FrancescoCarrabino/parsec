// src/panels/PropertiesPanel/elementSections/FrameProperties.tsx
import React from 'react';
import { PropertyGroup } from '../common/PropertyGroup';
import { PropertyRow, PropertyLabel, StringInput } from '../common/CommonControls';
import type { FrameElement } from '../../../state/types';

interface FramePropertiesProps {
    element: FrameElement;
    onUpdate: (updates: Partial<FrameElement>) => void;
}

export const FrameProperties: React.FC<FramePropertiesProps> = ({ element, onUpdate }) => {
    return (
        <PropertyGroup title="Frame Options">
            <PropertyRow>
                <PropertyLabel>Clip content</PropertyLabel>
                <input
                    type="checkbox"
                    checked={element.clipsContent}
                    onChange={(e) => onUpdate({ clipsContent: e.target.checked })}
                    style={{ width: '20px', height: '20px' }}
                />
            </PropertyRow>
            <PropertyRow>
                <PropertyLabel>Corner Radius</PropertyLabel>
                <StringInput
                    type="number"
                    value={String(element.cornerRadius)}
                    onChange={(e) => onUpdate({ cornerRadius: parseFloat(e.target.value) || 0 })}
                />
            </PropertyRow>
             <PropertyGroup title="Speaker Notes">
                <textarea
                    value={element.speakerNotes}
                    onChange={(e) => onUpdate({ speakerNotes: e.target.value })}
                    placeholder="Type notes here..."
                    style={{
                        width: '100%', boxSizing: 'border-box', height: '120px',
                        background: '#1e1e1e', color: '#ccc', border: '1px solid #444',
                        borderRadius: '4px', padding: '8px', fontFamily: 'inherit',
                        fontSize: '13px', resize: 'vertical'
                    }}
                />
            </PropertyGroup>
        </PropertyGroup>
    );
};