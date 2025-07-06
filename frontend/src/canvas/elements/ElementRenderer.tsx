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
// Recursive Renderer for Component Children (No Changes Needed)
// This component's logic is self-contained and correct.
// ====================================================================================
const RecursiveElementRenderer: React.FC<{
    element: CanvasElement;
    definition: ComponentDefinition;
    instance: ComponentInstanceElement;
}> = ({ element, definition, instance }) => {
    const customizedElement = { ...element };
    for (const prop of definition.schema) {
        if (prop.target_element_id === element.id) {
            const overrideValue = instance.properties[prop.prop_name];
            if (overrideValue !== undefined) {
                (customizedElement as any)[prop.target_property] = overrideValue;
            }
        }
    }
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
// Main Element Renderer (MODIFIED)
// ====================================================================================

// --- NEW, FLEXIBLE PROP DEFINITION ---
// The renderer can now accept EITHER an elementId OR a full element object.
// This allows it to be used by both the main canvas and the isolated presentation view.
interface ElementRendererProps {
	elementId?: string;
    element?: CanvasElement; // <-- NEW optional prop
	isVisible?: boolean;     // <-- Made optional
	onDragStart?: (e: KonvaEventObject<DragEvent>) => void;
	onDragMove?: (e: KonvaEventObject<DragEvent>) => void;
	onDragEnd?: (e: KonvaEventObject<DragEvent>) => void;
	onDblClick?: (e: KonvaEventObject<MouseEvent>) => void;
}

export const ElementRenderer: React.FC<ElementRendererProps> = (props) => {
	const { state } = useAppState();
	// --- MODIFIED LOGIC TO GET THE ELEMENT ---
	const { elementId, isVisible = true, onDragStart, onDragMove, onDragEnd, onDblClick } = props;
    
    // 1. If an `element` object is passed directly, use it.
    // 2. Otherwise, look it up in the global state using `elementId`.
    const element = props.element ?? (elementId ? state.elements[elementId] : null);

	// If no element can be found, render nothing. This is a safe fallback.
    if (!element) {
        if (elementId) { console.warn(`ElementRenderer: Element with ID "${elementId}" not found.`); }
        return null;
    }

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
                    draggable
                    visible={isVisible}
                    onDragStart={onDragStart}
                    onDragMove={onDragMove}
                    onDragEnd={onDragEnd}
                    onDblClick={onDblClick}
                >
                    {definition.template_elements.map(childElement => (
                        <RecursiveElementRenderer
                            key={childElement.id}
                            element={childElement}
                            definition={definition}
                            instance={instance}
                        />
                    ))}
                    <Rect width={instance.width} height={instance.height} fill="transparent" />
                </Group>
            );
        }

		case 'frame':
			// FrameComponent might also need to be checked, but for now we pass the full element.
            // The FrameComponent itself doesn't need drag handlers, just the double-click.
			return <FrameComponent element={element as FrameElement} onDblClick={onDblClick} />;
		case 'group':
			// Groups are logical containers and are not rendered directly by this component.
            // The main canvas logic handles rendering their children recursively.
			return null;
		default:
            console.error(`Unknown element type: ${(element as any).element_type}`);
			return null;
	}
};