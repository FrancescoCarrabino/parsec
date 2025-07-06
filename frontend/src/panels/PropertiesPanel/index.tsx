// src/panels/PropertiesPanel/index.tsx
import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { webSocketClient } from '../../api/websocket_client';
import type { CanvasElement, ShapeElement, TextElement, FrameElement, PathElement, ComponentInstanceElement, FillableElement } from '../../state/types'; // Import necessary types

// Import all our sections (use correct paths based on the new structure)
import { TransformSection } from './common/TransformSection';
import { FillSection } from './common/FillSection'; // Handles both fill and stroke content
import { ArrangeSection } from './common/ArrangeSection'; // Handles order
import { FrameProperties } from './elementSections/FrameProperties';
import { PresentationActions } from './elementSections/PresentationActions';
import { GroupingActions } from './elementSections/GroupingActions';
// Import the common PropertyGroup and controls
import { PropertyGroup, PropertyRow, PropertyLabel, StringInput } from './common/CommonControls';


// *** IMPORT THE CORRECT, FULLY FEATURED TEXT PROPERTIES SECTION ***
// Assuming TextPropertiesSection is in src/properties/
import { TextPropertiesSection } from './elementSections/TextPropertiesSection';

// Import the shared CSS Module for this panel structure
import styles from './PropertiesPanel.module.css';

// --- Re-define local components if they were in index.tsx originally ---
// (SpeakerNotesSection was local to index.tsx in your initial code)
const SpeakerNotesSection: React.FC<{ element: FrameElement; onUpdate: (prop: string, val: any) => void; }> = ({ element, onUpdate }) => {
  return (
    <PropertyGroup title="Speaker Notes">
      <textarea
        value={element.speakerNotes || ''} // Ensure it's always a string
        onChange={(e) => onUpdate('speakerNotes', e.target.value)}
        placeholder="Type your notes here..."
        className={styles.speakerNotesTextarea}
      />
    </PropertyGroup>
  );
};
// --- End local components ---


export const PropertiesPanel: React.FC = () => {
    const { state } = useAppState();
    const { elements, selectedElementIds } = state;

    const selectedElement = selectedElementIds.length === 1 ? elements[selectedElementIds[0]] : null;
    const selectionCount = selectedElementIds.length;

    // Unified update handler for the selected element
    const handleUpdate = (updates: Partial<CanvasElement>) => {
        if (!selectedElement) return;
        webSocketClient.sendElementUpdate({ id: selectedElement.id, ...updates });
    };

    // --- Render Content Based on Selection ---

    // Case 1: No element selected OR multiple elements selected
    if (!selectedElement) {
        // The GroupingActions component handles rendering the Group/Ungroup button based on selectionCount
        return (
            <div className={styles.panel}>
                <div className={styles.title}>Properties</div>
                 {/* Show message and grouping actions if multiple are selected */}
                {selectionCount > 1 ? (
                     <>
                        <p className={styles.noSelectionMessage} style={{ marginTop: '20px', marginBottom: '20px' }}>
                            {selectionCount} elements selected.
                        </p>
                         {/* Pass null for selectedElement when grouping multiple */}
                        <GroupingActions selectedElement={null} selectedElementIds={selectedElementIds} />
                     </>
                ) : (
                    // Show message if nothing is selected
                    <p className={styles.noSelectionMessage}>No element selected.</p>
                )}
            </div>
        );
    }

    // Case 2: A Component Instance is selected
    if (selectedElement.element_type === 'component_instance') {
        const instance = selectedElement as ComponentInstanceElement;
        const definition = state.componentDefinitions[instance.definition_id]; // Access from state
        if (!definition) {
             return (
                <div className={styles.panel}>
                    <div className={styles.title}>Component</div>
                    <p className={styles.noSelectionMessage}>Loading component definition...</p>
                </div>
             );
        }
         return (
            <div className={styles.panel}>
                 <div className={styles.title}>{definition.name || selectedElement.element_type}</div> {/* Use definition name if available */}
                 <InstancePropertiesSection instance={instance} definition={definition} />
            </div>
         );
    }

    // Case 3: A regular Canvas Element is selected
    // Safely cast elements using type guards or direct checks
    const textElement = selectedElement.element_type === 'text' ? selectedElement as TextElement : null;
    const frameElement = selectedElement.element_type === 'frame' ? selectedElement as FrameElement : null;
    const shapeElement = selectedElement.element_type === 'shape' ? selectedElement as ShapeElement : null;
    const pathElement = selectedElement.element_type === 'path' ? selectedElement as PathElement : null;
    // GroupElement check is primarily done within GroupingActions now
    // const groupElement = selectedElement.element_type === 'group' ? selectedElement : null;


    // Determine which sections to show based on element type
    const isText = !!textElement;
    const isFrame = !!frameElement;
    const isShape = !!shapeElement;
    const isPath = !!pathElement;
    // Check if element can have fill/stroke
    const isFillable = isShape || isFrame || isPath;


    return (
        <div className={styles.panel}>
            {/* Title Area */}
            <div className={styles.title}>{selectedElement.name || selectedElement.element_type}</div>

            {/* Transform Section (applies to all BaseElements) */}
            <TransformSection element={selectedElement} onUpdate={handleUpdate} />

            {/* Grouping Actions (Ungroup always shown if element is group/frame) */}
            {/* Pass the selected element and ALL selected IDs */}
            <GroupingActions selectedElement={selectedElement} selectedElementIds={selectedElementIds} />


            {/* Text Properties Section - ONLY for Text Elements */}
            {isText && <TextPropertiesSection element={textElement} onPropertyChange={handleUpdate} />}


            {/* Fill and Stroke Sections - ONLY for Fillable Elements */}
            {isFillable && (
                <> {/* Use fragment to avoid extra div */}
                     <PropertyGroup title="Fill">
                        {/* Pass the element and indicate we are controlling the main 'fill' property */}
                        <FillSection propertyType="fill" element={selectedElement as FillableElement} onUpdate={handleUpdate} />
                     </PropertyGroup>

                     <PropertyGroup title="Stroke">
                         {/* Pass the element and indicate we are controlling the 'stroke' property */}
                         <FillSection propertyType="stroke" element={selectedElement as FillableElement} onUpdate={handleUpdate} />
                     </PropertyGroup>
                </>
            )}

            {/* Corner Radius - ONLY for Shapes and Frames */}
            {(isShape || isFrame) && (
                <PropertyGroup title="Corners">
                    {/* Use PropertyRow and StringInput from CommonControls */}
                    <PropertyRow>
                        <PropertyLabel>Radius</PropertyLabel>
                        <StringInput
                            type="number"
                            value={String((selectedElement as ShapeElement | FrameElement).cornerRadius ?? 0)} // Default to 0 if undefined
                            onChange={(e) => handleUpdate({ cornerRadius: parseFloat(e.target.value) || 0 })}
                        />
                    </PropertyRow>
                </PropertyGroup>
            )}

            {/* Frame Specific Properties - ONLY for Frame Elements */}
            {isFrame && (
                <>
                    <FrameProperties element={frameElement} onUpdate={handleUpdate} />
                    {/* Speaker Notes is a separate section */}
                    <SpeakerNotesSection element={frameElement} onUpdate={handleUpdate} />
                    {/* Presentation Actions for Frames */}
                    <PresentationActions element={frameElement} />
                </>
            )}

            {/* Order Section (applies to all BaseElements for reordering Z-index) */}
             {/* ArrangeSection now includes the PropertyGroup title */}
            <ArrangeSection element={selectedElement} />

        </div>
    );
};