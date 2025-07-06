// src/panels/PropertiesPanel/common/FillSection.tsx
import React from 'react';
import { PropertyGroup, PropertyRow, PropertyLabel, StringInput, ActionButton, ColorInput, SelectInput } from './CommonControls';
import type { Fill, ShapeElement, FrameElement, PathElement, SolidFill, LinearGradientFill, GradientStop } from '../../../state/types';
import styles from '../PropertiesPanel.module.css'; // Import the shared module
import clsx from 'clsx'; // For conditional classes
import { PenTool } from 'lucide-react'; // Icon for Stroke buttons

type FillableElement = ShapeElement | FrameElement | PathElement;

interface FillSectionProps {
    // Indicate if this instance is controlling the main fill or the stroke's fill
    propertyType: 'fill' | 'stroke';
    element: FillableElement; // The element itself
    onUpdate: (updates: Partial<FillableElement>) => void; // Handler to update element properties
}

export const FillSection: React.FC<FillSectionProps> = ({ propertyType, element, onUpdate }) => {

    // Get the current fill/stroke object based on propertyType
    // For stroke, we are controlling the nested 'fill' property within the stroke object
    const currentFillOrStroke = propertyType === 'fill' ? element.fill : element.stroke;

    // Get the actual Fill object being configured (element.fill or element.stroke.fill)
    const actualFillObject = propertyType === 'fill' ? element.fill : element.stroke?.fill;


    // Handler for updating the actual Fill object (solid color, gradient, etc.)
    const handleActualFillUpdate = (newFill: Fill | null) => {
        if (propertyType === 'fill') {
            onUpdate({ fill: newFill }); // Update element.fill
        } else if (propertyType === 'stroke' && element.stroke) {
             // Update stroke.fill while keeping other stroke properties (color, width)
            onUpdate({ stroke: { ...element.stroke, fill: newFill } });
        }
    };

    // Handler for updating stroke width (only applicable if propertyType is 'stroke')
     const handleStrokeWidthUpdate = (newWidth: number) => {
        if (propertyType === 'stroke' && element.stroke) {
            onUpdate({ stroke: { ...element.stroke, width: newWidth } });
        }
     };


    // Handler for toggling fill/stroke existence
    const handleToggleExistence = () => {
        if (propertyType === 'fill') {
            // If removing, set fill to null. If adding, add a default solid fill.
            handleActualFillUpdate(currentFillOrStroke ? null : { type: 'solid', color: '#FFFFFF' });
        } else { // propertyType === 'stroke'
             // If removing, set stroke to null. If adding, add a default stroke object with default fill.
            onUpdate({ stroke: currentFillOrStroke ? null : { type: 'solid', color: '#888888', width: 1, fill: { type: 'solid', color: '#888888' } } });
        }
    };

     // Handler for changing the type of the actual fill object (solid, gradient)
     const handleFillTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newType = e.target.value;
        if (newType === 'solid') {
            // When changing type, try to preserve the color if coming from gradient stop 0
            const colorToPreserve = actualFillObject?.type === 'linear-gradient' ? actualFillObject.stops[0]?.color : (actualFillObject as SolidFill)?.color;
            handleActualFillUpdate({ type: 'solid', color: colorToPreserve || '#cccccc' }); // Default color if none preserved
        } else if (newType === 'linear-gradient') {
             // When changing type, try to preserve the color from solid as stop 0
             const colorToPreserve = (actualFillObject as SolidFill)?.color || '#cccccc';
            handleActualFillUpdate({
                type: 'linear-gradient',
                angle: 90,
                stops: [
                    { color: colorToPreserve, offset: 0 },
                    { color: '#0000ff', offset: 1 } // Default second stop
                ]
            });
        }
    };

    // Handler for updating a gradient stop
    const handleGradientStopChange = (index: number, newStop: Partial<GradientStop>) => {
        if (actualFillObject?.type !== 'linear-gradient') return;
        const newStops = [...actualFillObject.stops];
        newStops[index] = { ...newStops[index], ...newStop };
        handleActualFillUpdate({ ...actualFillObject, stops: newStops }); // Update the fill object
    };


    return (
        // This component doesn't render the PropertyGroup title itself,
        // it assumes the parent (index.tsx) wraps it in the correct PropertyGroup.
        <> {/* Use a fragment to contain the controls */}

            {/* Toggle Button (Add/Remove Fill or Stroke) */}
            { propertyType === 'fill' ? (
                 <ActionButton onClick={handleToggleExistence} className={currentFillOrStroke ? styles.removeFillButton : styles.addFillButton}>
                     {currentFillOrStroke ? 'Remove Fill' : 'Add Fill'}
                 </ActionButton>
            ) : ( // propertyType === 'stroke'
                 <ActionButton onClick={handleToggleExistence} className={currentFillOrStroke ? styles.removeStrokeButton : styles.addStrokeButton}>
                     <PenTool size={18} /> {currentFillOrStroke ? 'Remove Stroke' : 'Add Stroke'}
                 </ActionButton>
            )}


            {/* Show controls if the fill or stroke exists */}
            { currentFillOrStroke && (
                <>
                    {/* Stroke Width Input (only for Stroke section) */}
                    { propertyType === 'stroke' && element.stroke && (
                         <PropertyRow>
                            <PropertyLabel>Width</PropertyLabel>
                             {/* Use StringInput for number */}
                             <StringInput
                                type="number"
                                value={String(element.stroke.width ?? 0)} // Access stroke.width
                                onChange={(e) => handleStrokeWidthUpdate(parseFloat(e.target.value) || 0)}
                                step="1"
                             />
                         </PropertyRow>
                    )}

                    {/* Fill Type (Solid/Gradient) - Applies to element.fill OR element.stroke.fill */}
                     {actualFillObject && ( // Only show type picker if there's an actual fill object
                        <PropertyRow>
                            <PropertyLabel>Type</PropertyLabel>
                             {/* Use SelectInput for type selection */}
                             <SelectInput value={actualFillObject.type} onChange={handleFillTypeChange}>
                                <option value="solid">Solid</option>
                                <option value="linear-gradient">Linear Gradient</option>
                                {/* Add other types like radial-gradient if supported */}
                            </SelectInput>
                        </PropertyRow>
                     )}


                    {/* Solid Color Input - Only if actualFillObject is SolidFill type */}
                    {actualFillObject?.type === 'solid' && (
                        <PropertyRow>
                             <PropertyLabel>Color</PropertyLabel>
                             {/* Use the refactored ColorInput */}
                             <ColorInput value={(actualFillObject as SolidFill).color} onChange={(e) => handleActualFillUpdate({ ...actualFillObject, color: e.target.value })} />
                        </PropertyRow>
                    )}

                     {/* Linear Gradient Inputs - Only if actualFillObject is LinearGradientFill type */}
                     {actualFillObject?.type === 'linear-gradient' && (
                        <div style={{ marginTop: '12px' }}>
                             <PropertyRow>
                                 <PropertyLabel>Angle</PropertyLabel>
                                 {/* Use StringInput for number */}
                                 <StringInput type="number" value={String((actualFillObject as LinearGradientFill).angle ?? 0)} onChange={e => handleActualFillUpdate({ ...actualFillObject, angle: parseInt(e.target.value, 10) || 0 })} />
                             </PropertyRow>
                            {/* Gradient Stops */}
                            {(actualFillObject as LinearGradientFill).stops.map((stop, index) => (
                                <div key={index} style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '8px', marginTop: '8px' }}>
                                    <PropertyRow>
                                        <PropertyLabel>Stop {index + 1} Color</PropertyLabel>
                                        {/* Use the refactored ColorInput */}
                                        <ColorInput value={stop.color} onChange={e => handleGradientStopChange(index, { color: e.target.value })} />
                                    </PropertyRow>
                                    <PropertyRow>
                                        <PropertyLabel>Stop {index + 1} Position</PropertyLabel>
                                        {/* Use StringInput with type range for position */}
                                        <StringInput type="range" min="0" max="1" step="0.01" value={String(stop.offset ?? 0)} onChange={e => handleGradientStopChange(index, { offset: parseFloat(e.target.value) || 0 })} style={{ cursor: 'pointer' }} />
                                    </PropertyRow>
                                </div>
                            ))}
                        </div>
                     )}
                </>
            )}
        </>
    );
};