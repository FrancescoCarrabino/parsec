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
// Recursive Renderer for Component Children (No changes needed here)
// ====================================================================================
const RecursiveElementRenderer: React.FC<{
    element: CanvasElement;
    definition: ComponentDefinition;
    instance: ComponentInstanceElement;
    // Add a prop to pass through visibility from the instance
    isVisible: boolean; 
}> = ({ element, definition, instance, isVisible }) => {
    const customizedElement = { ...element };
    for (const prop of definition.schema) {
        if (prop.target_element_id === element.id) {
            const overrideValue = instance.properties[prop.prop_name];
            if (overrideValue !== undefined) {
                (customizedElement as any)[prop.target_property] = overrideValue;
            }
        }
    }
    // Pass the isVisible prop down to the final component
    switch (customizedElement.element_type) {
        case 'shape':
            return <ShapeComponent element={customizedElement as ShapeElement} isVisible={isVisible} />;
        case 'text':
            return <TextComponent element={customizedElement as TextElement} isVisible={isVisible} />;
        case 'path':
            return <PathComponent element={customizedElement as PathElement} isVisible={isVisible} />;
        case 'image':
            return <ImageComponent element={customizedElement as ImageElement} isVisible={isVisible} />;
        default:
            return null;
    }
}


// ====================================================================================
// Main Element Renderer (FIXED)
// ====================================================================================

// --- NEW, MORE FLEXIBLE PROP DEFINITION ---
// This interface allows any prop to be passed through, which is key to making this work.
interface ElementRendererProps {
	elementId?: string;
    element?: CanvasElement;
    [key: string]: any; // This index signature is the important part
}

export const ElementRenderer: React.FC<ElementRendererProps> = (props) => {
	const { state } = useAppState();
	
    // --- CAPTURE ALL PROPS ---
    // We destructure to get the props we need for logic here, and bundle EVERYTHING else into 'rest'.
    // 'rest' will contain: isVisible, draggable, onDragStart, onDragMove, onDragEnd, onDblClick, etc.
	const { elementId, element: directElement, ...rest } = props;
    
    // This logic to get the element is correct.
    const element = directElement ?? (elementId ? state.elements[elementId] : null);

    if (!element) {
        if (elementId) { console.warn(`ElementRenderer: Element with ID "${elementId}" not found.`); }
        return null;
    }

	// --- PASS ALL PROPS THROUGH ---
    // We spread the 'rest' object onto each component. This ensures that every prop
    // (including 'draggable') makes it to the final destination.
	switch (element.element_type) {
		case 'shape':
			return <ShapeComponent element={element as ShapeElement} {...rest} />;
		case 'text':
			return <TextComponent element={element as TextElement} {...rest} />;
		case 'path':
			return <PathComponent element={element as PathElement} {...rest} />;
		case 'image':
			return <ImageComponent element={element as ImageElement} {...rest} />;
        
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
                    x={instance.x} y={instance.y}
                    width={instance.width} height={instance.height}
                    rotation={instance.rotation}
                    // Pass all props like draggable, visible, and event handlers
                    {...rest} 
                >
                    {definition.template_elements.map(childElement => (
                        <RecursiveElementRenderer
                            key={childElement.id}
                            element={childElement}
                            definition={definition}
                            instance={instance}
                            // Pass the instance's visibility to its children
                            isVisible={rest.isVisible ?? true} 
                        />
                    ))}
                    {/* A transparent rect can help with hit detection for the group */}
                    <Rect width={instance.width} height={instance.height} fill="transparent" listening={false} />
                </Group>
            );
        }

		case 'frame':
            // Frames are containers rendered by ElementTreeRenderer. We only need a component
            // here if the frame itself has visual properties (like a background) that aren't
            // handled by the Konva.Group in ElementTreeRenderer. Your current setup handles
            // the frame background in ElementTreeRenderer, so this is likely not needed.
            // We pass onDblClick as that is a direct interaction.
			return <FrameComponent element={element as FrameElement} onDblClick={rest.onDblClick} />;
		
        case 'group':
			// Groups are logical containers and are not rendered directly by this component.
			return null;
		
        default:
            // This is a safe fallback to catch any unhandled element types.
            const unhandledType: any = element;
            if (unhandledType && unhandledType.element_type) {
                console.error(`Unknown element type: ${unhandledType.element_type}`);
            }
			return null;
	}
};