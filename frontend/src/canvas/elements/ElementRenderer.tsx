// parsec-frontend/src/canvas/elements/ElementRenderer.tsx

import React from 'react';
import { KonvaEventObject } from 'konva/lib/Node';
import { useAppState } from '../../state/AppStateContext';
import { ShapeComponent } from './ShapeComponent';
import { TextComponent } from './TextComponent';
import { PathComponent } from './PathComponent';
import { FrameComponent } from './FrameComponent';
import ImageComponent from './ImageComponent';
import { Group, Rect } from 'react-konva'; // NEW: Import Group and Rect for component rendering
import type {
    ShapeElement, TextElement, PathElement, FrameElement,
    ImageElement, ComponentInstanceElement, CanvasElement // NEW: Import component types
} from '../../state/types';

// ====================================================================================
// NEW: Recursive Renderer for Component Children
// This is a simplified renderer used only for drawing the elements INSIDE a component.
// These inner elements are not individually interactive; they are part of the larger component.
// ====================================================================================
const RecursiveElementRenderer: React.FC<{ element: CanvasElement, instanceProps: Record<string, any> }> = ({ element, instanceProps }) => {
    // --- Property Overriding Logic ---
    // Check if this child element's properties are controlled by the parent instance.
    // We create a copy of the element and override its properties if necessary.
    const customizedElement = { ...element };
    
    // Example of overriding a text element's content. This can be expanded.
    // Note: The backend schema ensures `target_property` and `prop_name` are linked.
    if (customizedElement.element_type === 'text' && instanceProps[`${customizedElement.id}_content`]) {
        customizedElement.content = instanceProps[`${customizedElement.id}_content`];
    }
    // Future overrides (e.g., for image `src` or shape `fill`) would go here.

    switch (customizedElement.element_type) {
        case 'shape':
            return <ShapeComponent element={customizedElement as ShapeElement} isVisible={true} />;
        case 'text':
            return <TextComponent element={customizedElement as TextElement} isVisible={true} />;
        case 'path':
            return <PathComponent element={customizedElement as PathElement} isVisible={true} />;
        case 'image':
            return <ImageComponent element={customizedElement as ImageElement} isVisible={true} />;
        // Note: We don't render frames or groups recursively inside components for simplicity.
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
        
        // --- NEW CASE FOR COMPONENT INSTANCE ---
        case 'component_instance': {
            const instance = element as ComponentInstanceElement;
            const definition = state.componentDefinitions[instance.definition_id];

            // If the definition hasn't loaded yet, render nothing. This prevents crashes.
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
                            instanceProps={instance.properties}
                        />
                    ))}
                    {/* The "Hitbox" Pattern: A transparent rectangle that covers the
                        entire component. This ensures the component is easily and reliably
                        selectable/draggable, even if it has empty spaces. It must be last. */}
                    <Rect
                        width={instance.width}
                        height={instance.height}
                        fill="transparent"
                    />
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