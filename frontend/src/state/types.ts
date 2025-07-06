// parsec-frontend/src/state/types.ts
// --- No changes to Fill types ---
export interface SolidFill { type: 'solid'; color: string; }
export interface GradientStop { color: string; offset: number; }
export interface LinearGradientFill { type: 'linear-gradient'; angle: number; stops: GradientStop[]; }
export type Fill = SolidFill | LinearGradientFill;

// --- No changes to BaseElement or Path points ---
export interface BaseElement { id: string; element_type: string; x: number; y: number; rotation: number; width: number; height: number; zIndex: number; isVisible: boolean; parentId: string | null; name: string; }
export interface PathControlPoint { x: number; y: number; }
export interface PathPoint { x: number; y: number; handleIn?: PathControlPoint; handleOut?: PathControlPoint; handleType?: 'symmetrical' | 'asymmetrical' | 'disconnected'; }

// --- ELEMENT INTERFACES ---
export interface ShapeElement extends BaseElement { element_type: "shape"; shape_type: "rect" | "circle" | "ellipse"; fill?: Fill | null; stroke?: Fill | null; strokeWidth: number; cornerRadius?: number; }
export interface GroupElement extends BaseElement { element_type: 'group'; }
export interface TextElement extends BaseElement {
    element_type: 'text';
    content: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    fontColor: string; // <-- Default should be here
    letterSpacing: number; // <-- Default should be here
    lineHeight: number; // <-- Default should be here
    align: 'left' | 'center' | 'right'; // <-- Default should be here
    verticalAlign: 'top' | 'middle' | 'bottom'; // <-- Default should be here
}

// MODIFIED: FrameElement now includes presentation-specific properties
export interface FrameElement extends BaseElement {
    element_type: 'frame';
    fill?: Fill | null;
    stroke?: Fill | null;
    strokeWidth: number;
    clipsContent: boolean;
    cornerRadius?: number;
    speakerNotes: string;         // <-- NEW
    presentationOrder: number | null; // <-- NEW
}

export interface PathElement extends BaseElement { element_type: 'path'; points: PathPoint[]; isClosed: boolean; fill?: Fill | null; stroke?: Fill | null; strokeWidth: number; }
export interface ImageElement extends BaseElement {
    element_type: 'image';
    src: string; // URL of the generated image
    prompt?: string;
}

export interface ComponentInstanceElement extends BaseElement {
    element_type: 'component_instance';
    definition_id: string;
    properties: Record<string, any>;
}

export interface ComponentProperty {
    prop_name: string;
    target_element_id: string;
    target_property: string;
    prop_type: 'text' | 'image_url' | 'color';
}

export interface ComponentDefinition {
    id: string;
    name: string;
    template_elements: CanvasElement[];
    schema: ComponentProperty[];
}

// --- UPDATED UNION TYPE (FrameElement is already included) ---
export type CanvasElement = ShapeElement | GroupElement | TextElement | FrameElement | PathElement | ImageElement | ComponentInstanceElement;

// --- WORKSPACE STATE INTERFACE (for initial load) ---
export interface WorkspaceState {
    elements: CanvasElement[];
    componentDefinitions: ComponentDefinition[];
}

export type ActiveTool = 'select' | 'rectangle' | 'text' | 'frame' | 'ellipse' | 'pen';

// NEW: A dedicated state slice for the presentation itself
export interface PresentationState {
    isActive: boolean;
    currentSlideIndex: number;
    presenterWindow: Window | null;
}

// MODIFIED: The main AppState now includes the presentation state
export type AppState = {
	elements: Record<string, CanvasElement>;
    componentDefinitions: Record<string, ComponentDefinition>;
	selectedElementIds: string[];
	groupEditingId: string | null;
	activeTool: ActiveTool;
    editingElementId: string | null;
    presentation: PresentationState; // <-- NEW
};

// MODIFIED: Added new actions for presentation mode
export type Action =
	| { type: 'SET_WORKSPACE_STATE'; payload: WorkspaceState }
	| { type: 'ELEMENT_CREATED'; payload: CanvasElement }
	| { type: 'ELEMENT_UPDATED'; payload: CanvasElement }
	| { type: 'ELEMENTS_UPDATED'; payload: CanvasElement[] }
	| { type: 'ELEMENT_DELETED'; payload: { id: string } }
    | { type: 'COMPONENT_DEFINITION_CREATED'; payload: ComponentDefinition }
	| { type: 'SET_SELECTION'; payload: { ids: string[] } }
	| { type: 'ADD_TO_SELECTION'; payload: { id: string } }
	| { type: 'REMOVE_FROM_SELECTION'; payload: { id:string } }
	| { type: 'ENTER_GROUP_EDITING'; payload: { groupId: string; elementId: string } }
	| { type: 'EXIT_GROUP_EDITING' }
	| { type: 'SET_ACTIVE_TOOL'; payload: { tool: ActiveTool } }
    | { type: 'SET_EDITING_ELEMENT_ID'; payload: { id: string | null } }
    // --- NEW PRESENTATION ACTIONS ---
    | { type: 'START_PRESENTATION'; payload: { presenterWindow: Window | null } }
    | { type: 'STOP_PRESENTATION' }
    | { type: 'NEXT_SLIDE' }
    | { type: 'PREV_SLIDE' }
    | { type: 'SET_SLIDE'; payload: { index: number } };