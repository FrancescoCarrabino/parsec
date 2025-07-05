// parsec-frontend/src/canvas/elements/ElementRenderer.tsx

import React from 'react';
import { KonvaEventObject } from 'konva/lib/Node';
import { useAppState } from '../../state/AppStateContext';
import { ShapeComponent } from './ShapeComponent';
import { TextComponent } from './TextComponent';
import { PathComponent } from './PathComponent';
import { FrameComponent } from './FrameComponent';
import ImageComponent from './ImageComponent';
import { Group, Rect } from 'react-konva';
import type {
    ShapeElement, TextElement, PathElement, FrameElement,
    ImageElement, ComponentInstanceElement, CanvasElement, ComponentDefinition
} from '../../state/types';


// ====================================================================================
// NEW: Recursive Renderer for Component Children
// This is a simplified renderer used only for drawing the elements INSIDE a component.
// ====================================================================================
const RecursiveElementRenderer: React.FC<{
    element: CanvasElement;
    definition: ComponentDefinition;
    instance: ComponentInstanceElement;
}> = ({ element, definition, instance }) => {
    
    // --- THIS IS THE CORE OVERRIDE LOGIC ---
    // Start with a copy of the template element's data.
    const customizedElement = { ...element };

    // Go through the component's schema to see if any properties target this child element.
    for (const prop of definition.schema) {
        if (prop.target_element_id === element.id) {
            const overrideValue = instance.properties[prop.prop_name];
            // If the instance has a value for this property, apply it.
            if (overrideValue !== undefined) {
                // Use a type assertion to allow dynamic property setting.
                (customizedElement as any)[prop.target_property] = overrideValue;
            }
        }
    }
    // --- END OF CORE OVERRIDE LOGIC ---

    // Render the element using its (potentially customized) data.
    switch (customizedElement.element_type) {
        case 'shape':
            return <ShapeComponent element={customizedElement as ShapeElement} isVisible={true} />;
        case 'text':
            return <TextComponent element={customizedElement as TextElement} isVisible={true} />;
        case 'path':
            return <PathComponent element={customizedElement as PathElement} isVisible={true} />;
        case 'image':
            return <ImageComponent element={customizedElement as ImageElement} isVisible={true} />;
        default:
            return null;
    }
}


// ====================================================================================
// Main Element Renderer
// ====================================================================================
interface ElementRendererProps {
	elementId: string;
	isVisible: boolean;
	onDragStart?: (e: KonvaEventObject<DragEvent>) => void;
	onDragMove?: (e: KonvaEventObject<DragEvent>) => void;
	onDragEnd?: (e: KonvaEventObject<DragEvent>) => void;
	onDblClick?: (e: KonvaEventObject<MouseEvent>) => void;
}

export const ElementRenderer: React.FC<ElementRendererProps> = (props) => {
	const { state } = useAppState();
	const { elementId, isVisible, onDragStart, onDragMove, onDragEnd, onDblClick } = props;
	const element = state.elements[elementId];

	if (!element) return null;

	const commonProps = { onDragStart, onDragMove, onDragEnd, onDblClick, isVisible };
	
	switch (element.element_type) {
		case 'shape':
			return <ShapeComponent element={element as ShapeElement} {...commonProps} />;
		case 'text':
			return <TextComponent element={element as TextElement} {...commonProps} />;
		case 'path':
			return <PathComponent element={element as PathElement} {...commonProps} />;
		case 'image':
			return <ImageComponent element={element as ImageElement} {...commonProps} />;
        
        case 'component_instance': {
            const instance = element as ComponentInstanceElement;
            const definition = state.componentDefinitions[instance.definition_id];

            if (!definition) {
                console.warn(`Component definition ${instance.definition_id} not found for instance ${instance.id}`);
                return null;
            }

            return (
                <Group
                    id={instance.id}
                    x={instance.x}
                    y={instance.y}
                    width={instance.width}
                    height={instance.height}
                    rotation={instance.rotation}
                    draggable // The whole group is draggable
                    visible={isVisible}
                    onDragStart={onDragStart}
                    onDragMove={onDragMove}
                    onDragEnd={onDragEnd}
                    onDblClick={onDblClick}
                >
                    {/* Render each element from the component's template */}
                    {definition.template_elements.map(childElement => (
                        <RecursiveElementRenderer
                            key={childElement.id}
                            element={childElement}
                            definition={definition} // Pass down the full definition
                            instance={instance}     // Pass down the instance
                        />
                    ))}
                    {/* The "Hitbox" */}
                    <Rect width={instance.width} height={instance.height} fill="transparent" />
                </Group>
            );
        }

		case 'frame':
			return <FrameComponent element={element as FrameElement} onDblClick={onDblClick} />;
		case 'group':
			return null;
		default:
            console.error(`Unknown element type: ${(element as any).element_type}`);
			return null;
	}
};