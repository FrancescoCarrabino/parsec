// src/panels/PropertiesPanel/index.tsx
import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { webSocketClient } from '../../api/websocket_client';
import type { CanvasElement, ShapeElement, TextElement, FrameElement, PathElement } from '../../state/types';

// Import all our sections (no change here)
import { TransformSection } from './common/TransformSection';
import { FillSection } from './common/FillSection';
import { ArrangeSection } from './common/ArrangeSection';
import { TextProperties } from './elementSections/TextProperties';
import { FrameProperties } from './elementSections/FrameProperties';
import { PresentationActions } from './elementSections/PresentationActions';
import { GroupingActions } from './elementSections/GroupingActions';

const panelStyle: React.CSSProperties = { width: '280px', height: '100%', background: '#252627', color: '#ccc', padding: '16px', boxSizing: 'border-box', fontFamily: 'sans-serif', fontSize: '14px', zIndex: 10, borderLeft: '1px solid #444', overflowY: 'auto' };
const titleStyle: React.CSSProperties = { color: 'white', fontWeight: 'bold', marginBottom: '10px', fontSize: '16px', borderBottom: '1px solid #444', paddingBottom: '8px' };
const noSelectionStyle: React.CSSProperties = { color: '#888', textAlign: 'center', marginTop: '40px' };

export const PropertiesPanel: React.FC = () => {
    const { state } = useAppState();
    const { elements, selectedElementIds } = state;

    const selectedElement = selectedElementIds.length === 1 ? elements[selectedElementIds[0]] : null;
    const selectionCount = selectedElementIds.length;

    const handleUpdate = (updates: Partial<CanvasElement>) => {
        if (!selectedElement) return;
        webSocketClient.sendElementUpdate({ id: selectedElement.id, ...updates });
    };

    if (!selectedElement) {
        return (
            <div style={panelStyle}>
                <div style={titleStyle}>Properties</div>
                <p style={noSelectionStyle}>
                    {selectionCount > 1 ? `${selectionCount} elements selected` : 'No element selected.'}
                </p>
                {selectionCount > 1 && <GroupingActions selectedElement={null} selectedElementIds={selectedElementIds} />}
            </div>
        );
    }
    
    const isText = selectedElement.element_type === 'text';
    const isFrame = selectedElement.element_type === 'frame';
    const isFillable = ['shape', 'frame', 'path'].includes(selectedElement.element_type);
    
    return (
        <div style={panelStyle}>
            <div style={titleStyle}>{selectedElement.name || selectedElement.element_type}</div>

            <TransformSection element={selectedElement} onUpdate={handleUpdate} />
            <GroupingActions selectedElement={selectedElement} selectedElementIds={selectedElementIds} />
            
            {isText && <TextProperties element={selectedElement as TextElement} onUpdate={handleUpdate} />}
            {isFrame && <FrameProperties element={selectedElement as FrameElement} onUpdate={handleUpdate} />}
            {isFrame && <PresentationActions element={selectedElement as FrameElement} />}
            
            {isFillable && <FillSection element={selectedElement as ShapeElement | FrameElement | PathElement} onUpdate={handleUpdate} />}
            
            {/* --- THIS IS THE FIX: Pass the full element object, not just the ID --- */}
            <ArrangeSection element={selectedElement} />
        </div>
    );
};