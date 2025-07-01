// --- NEW FILL TYPES ---
export interface SolidFill {
	type: 'solid';
	color: string;
}

export interface GradientStop {
	color: string;
	offset: number; // 0 to 1
}

export interface LinearGradientFill {
	type: 'linear-gradient';
	angle: number;
	stops: GradientStop[];
}

export type Fill = SolidFill | LinearGradientFill;
// --------------------

export interface BaseElement {
	id: string;
	element_type: string;
	x: number; y: number;
	rotation: number;
	width: number; height: number;
	zIndex: number; isVisible: boolean;
	parentId: string | null;
	name: string;
	cornerRadius?: number;
}

export interface ShapeElement extends BaseElement {
	element_type: "shape";
	shape_type: "rect" | "circle";
	fill: Fill; // <-- UPDATED
	stroke: Fill | null; // A stroke can be a Fill object or null
	strokeWidth: number;
}

export interface GroupElement extends BaseElement {
	element_type: 'group';
}
export interface TextElement extends BaseElement {
	element_type: 'text';
	content: string;
	fontFamily: string;
	fontSize: number;
	fontColor: string;
	align: 'left' | 'center' | 'right';
	verticalAlign: 'top' | 'middle' | 'bottom';
}
export interface FrameElement extends BaseElement {
	element_type: 'frame';
	fill: Fill;
	stroke: Fill | null;
	strokeWidth: number;
	clipsContent: boolean;
	cornerRadius?: number;
}

// --- UPDATE THE UNION TYPES ---
export type CanvasElement = ShapeElement | GroupElement | TextElement | FrameElement;
export type ActiveTool = 'select' | 'rectangle' | 'text' | 'frame';

export type AppState = {
	elements: Record<string, CanvasElement>;
	selectedElementIds: string[];
	groupEditingId: string | null;
	activeTool: ActiveTool; // <-- ADDED
};

export type Action =
	| { type: 'SET_WORKSPACE_STATE'; payload: CanvasElement[] }
	| { type: 'ELEMENT_CREATED'; payload: CanvasElement }
	| { type: 'ELEMENT_UPDATED'; payload: CanvasElement }
	| { type: 'ELEMENTS_UPDATED'; payload: CanvasElement[] }
	| { type: 'ELEMENT_DELETED'; payload: { id: string } }
	| { type: 'SET_SELECTION'; payload: { ids: string[] } }
	| { type: 'ADD_TO_SELECTION'; payload: { id: string } }
	| { type: 'REMOVE_FROM_SELECTION'; payload: { id: string } }
	| { type: 'ENTER_GROUP_EDITING'; payload: { groupId: string; elementId: string } }
	| { type: 'EXIT_GROUP_EDITING' }
	| { type: 'SET_ACTIVE_TOOL'; payload: { tool: ActiveTool } }; // <-- ADDED
