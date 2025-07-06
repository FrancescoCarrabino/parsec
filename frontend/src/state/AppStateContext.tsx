// parsec-frontend/src/state/AppStateContext.tsx
import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import type { AppState, Action, CanvasElement, FrameElement, ComponentDefinition, WorkspaceState, TextElement } from './types'; // Import TextElement
import { nanoid } from 'nanoid'; // Assuming nanoid is available for ID generation

// Define default properties for a new text element
const DEFAULT_TEXT_PROPERTIES: Omit<TextElement, keyof BaseElement | 'element_type'> = {
    content: 'Type something...',
    fontFamily: 'Inter', // Default font family
    fontSize: 16,       // Default font size
    fontWeight: 400,    // Default font weight (Regular)
    fontColor: '#000000', // Default font color (black) - consider #FFFFFF if dark theme
    letterSpacing: 0,   // Default letter spacing
    lineHeight: 1.2,    // Default line height
    align: 'left',      // Default text alignment
    verticalAlign: 'top', // Default vertical alignment
};

const AppStateContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | undefined>(undefined);

const initialState: AppState = {
    elements: {},
    componentDefinitions: {},
    selectedElementIds: [],
    groupEditingId: null,
    activeTool: 'select',
    editingElementId: null,
    presentation: {
        isActive: false,
        currentSlideIndex: 0,
        presenterWindow: null,
    },
};

const appStateReducer = (state: AppState, action: Action): AppState => {
    switch (action.type) {
        case 'SET_WORKSPACE_STATE': {
            const elementsRecord: Record<string, CanvasElement> = {};
            action.payload.elements.forEach(el => {
                // Apply defaults to TextElements loaded from workspace state
                if (el.element_type === 'text') {
                    const textEl = el as TextElement;
                    // Use nullish coalescing (??) to apply defaults ONLY if the property is missing or null/undefined
                    el = {
                        ...textEl,
                        fontFamily: textEl.fontFamily ?? DEFAULT_TEXT_PROPERTIES.fontFamily,
                        fontSize: textEl.fontSize ?? DEFAULT_TEXT_PROPERTIES.fontSize,
                        fontWeight: textEl.fontWeight ?? DEFAULT_TEXT_PROPERTIES.fontWeight,
                        fontColor: textEl.fontColor ?? DEFAULT_TEXT_PROPERTIES.fontColor,
                        letterSpacing: textEl.letterSpacing ?? DEFAULT_TEXT_PROPERTIES.letterSpacing,
                        lineHeight: textEl.lineHeight ?? DEFAULT_TEXT_PROPERTIES.lineHeight,
                        align: textEl.align ?? DEFAULT_TEXT_PROPERTIES.align,
                        verticalAlign: textEl.verticalAlign ?? DEFAULT_TEXT_PROPERTIES.verticalAlign,
                    };
                }
                elementsRecord[el.id] = el;
            });
            const componentDefinitionsRecord = action.payload.componentDefinitions.reduce((acc, def) => {
                acc[def.id] = def;
                return acc;
            }, {} as Record<string, ComponentDefinition>);

            // Return state with potentially updated elements and component definitions
            return { ...state, elements: elementsRecord, componentDefinitions: componentDefinitionsRecord };
        }

        case 'ELEMENT_CREATED': {
            let newElement = action.payload;
            // Apply defaults for TextElements upon creation if properties are missing
            if (newElement.element_type === 'text') {
                const textEl = newElement as TextElement;
                newElement = {
                    ...textEl,
                    fontFamily: textEl.fontFamily ?? DEFAULT_TEXT_PROPERTIES.fontFamily,
                    fontSize: textEl.fontSize ?? DEFAULT_TEXT_PROPERTIES.fontSize,
                    fontWeight: textEl.fontWeight ?? DEFAULT_TEXT_PROPERTIES.fontWeight,
                    fontColor: textEl.fontColor ?? DEFAULT_TEXT_PROPERTIES.fontColor,
                    letterSpacing: textEl.letterSpacing ?? DEFAULT_TEXT_PROPERTIES.letterSpacing,
                    lineHeight: textEl.lineHeight ?? DEFAULT_TEXT_PROPERTIES.lineHeight,
                    align: textEl.align ?? DEFAULT_TEXT_PROPERTIES.align,
                    verticalAlign: textEl.verticalAlign ?? DEFAULT_TEXT_PROPERTIES.verticalAlign,
                };
            }
            // Add the (potentially defaulted) new element to the state
            return { ...state, elements: { ...state.elements, [newElement.id]: newElement } };
        }

        case 'ELEMENT_UPDATED': {
            let updatedElement = action.payload;
            // Apply defaults for TextElements if they are updated and missing properties
            if (updatedElement.element_type === 'text') {
                const textEl = updatedElement as TextElement;
                updatedElement = {
                    ...textEl,
                    fontFamily: textEl.fontFamily ?? DEFAULT_TEXT_PROPERTIES.fontFamily,
                    fontSize: textEl.fontSize ?? DEFAULT_TEXT_PROPERTIES.fontSize,
                    fontWeight: textEl.fontWeight ?? DEFAULT_TEXT_PROPERTIES.fontWeight,
                    fontColor: textEl.fontColor ?? DEFAULT_TEXT_PROPERTIES.fontColor,
                    letterSpacing: textEl.letterSpacing ?? DEFAULT_TEXT_PROPERTIES.letterSpacing,
                    lineHeight: textEl.lineHeight ?? DEFAULT_TEXT_PROPERTIES.lineHeight,
                    align: textEl.align ?? DEFAULT_TEXT_PROPERTIES.align,
                    verticalAlign: textEl.verticalAlign ?? DEFAULT_TEXT_PROPERTIES.verticalAlign,
                };
            }
            // Update the element in the state
            return { ...state, elements: { ...state.elements, [updatedElement.id]: updatedElement } };
        }

        case 'ELEMENTS_UPDATED': {
            const newElements = { ...state.elements };
            action.payload.forEach(el => {
                // Apply defaults to updated elements if they are text and missing properties
                if (el.element_type === 'text') {
                    const textEl = el as TextElement;
                    el = {
                        ...textEl,
                        fontFamily: textEl.fontFamily ?? DEFAULT_TEXT_PROPERTIES.fontFamily,
                        fontSize: textEl.fontSize ?? DEFAULT_TEXT_PROPERTIES.fontSize,
                        fontWeight: textEl.fontWeight ?? DEFAULT_TEXT_PROPERTIES.fontWeight,
                        fontColor: textEl.fontColor ?? DEFAULT_TEXT_PROPERTIES.fontColor,
                        letterSpacing: textEl.letterSpacing ?? DEFAULT_TEXT_PROPERTIES.letterSpacing,
                        lineHeight: textEl.lineHeight ?? DEFAULT_TEXT_PROPERTIES.lineHeight,
                        align: textEl.align ?? DEFAULT_TEXT_PROPERTIES.align,
                        verticalAlign: textEl.verticalAlign ?? DEFAULT_TEXT_PROPERTIES.verticalAlign,
                    };
                }
                newElements[el.id] = el;
            });
            return { ...state, elements: newElements };
        }

        case 'ELEMENT_DELETED': {
            const newElements = { ...state.elements };
            delete newElements[action.payload.id];
            return { ...state, elements: newElements };
        }

        case 'COMPONENT_DEFINITION_CREATED': {
            return {
                ...state,
                componentDefinitions: {
                    ...state.componentDefinitions,
                    [action.payload.id]: action.payload,
                }
            };
        }

        case 'SET_SELECTION':
            return { ...state, selectedElementIds: action.payload.ids };
        case 'ADD_TO_SELECTION':
            if (state.selectedElementIds.includes(action.payload.id)) return state;
            return { ...state, selectedElementIds: [...state.selectedElementIds, action.payload.id] };
        case 'REMOVE_FROM_SELECTION':
            return { ...state, selectedElementIds: state.selectedElementIds.filter(id => id !== action.payload.id) };
        case 'ENTER_GROUP_EDITING':
            return { ...state, groupEditingId: action.payload.groupId, selectedElementIds: [action.payload.elementId] };
        case 'EXIT_GROUP_EDITING':
            // When exiting group editing, we might want to re-select the group itself or its parent
            // The current logic re-selects the last edited element or the group ID if it exists.
            return { ...state, groupEditingId: null, selectedElementIds: state.groupEditingId ? [state.groupEditingId] : [] };
        case 'SET_ACTIVE_TOOL':
            return { ...state, activeTool: action.payload.tool };
        case 'SET_EDITING_ELEMENT_ID':
            return { ...state, editingElementId: action.payload.id };

        // --- PRESENTATION LOGIC (Unchanged from last version, assumes it's correct) ---
        case 'START_PRESENTATION': {
            const slides = Object.values(state.elements)
                .filter(el => el.element_type === 'frame' && (el as FrameElement).presentationOrder !== null) as FrameElement[];
            
            slides.sort((a, b) => a.presentationOrder! - b.presentationOrder!);
            
            let startIndex = 0;
            if (state.selectedElementIds.length === 1) {
                const foundIndex = slides.findIndex(s => s.id === state.selectedElementIds[0]);
                if (foundIndex !== -1) {
                    startIndex = foundIndex;
                }
            }

            return {
                ...state,
                presentation: {
                    isActive: true,
                    currentSlideIndex: startIndex,
                    presenterWindow: null, // This will be handled by the PresentationView component itself
                }
            };
        }
        case 'STOP_PRESENTATION':
            return {
                ...state,
                presentation: {
                    isActive: false,
                    currentSlideIndex: 0,
                    presenterWindow: null,
                }
            };
        case 'NEXT_SLIDE': {
            const slideCount = Object.values(state.elements).filter(el => el.element_type === 'frame' && el.presentationOrder !== null).length;
            if (state.presentation.currentSlideIndex >= slideCount - 1) return state;
            return {
                ...state,
                presentation: {
                    ...state.presentation,
                    currentSlideIndex: state.presentation.currentSlideIndex + 1,
                }
            };
        }
        case 'PREV_SLIDE': {
            if (state.presentation.currentSlideIndex <= 0) return state;
            return {
                ...state,
                presentation: {
                    ...state.presentation,
                    currentSlideIndex: state.presentation.currentSlideIndex - 1,
                }
            };
        }
        case 'SET_SLIDE':
            return {
                ...state,
                presentation: {
                    ...state.presentation,
                    currentSlideIndex: action.payload.index,
                }
            };
        case 'WORKSPACE_RESET': {
            const elementsRecord: Record<string, CanvasElement> = {};
            action.payload.elements.forEach(el => {
                // Apply defaults to TextElements during reset as well
                if (el.element_type === 'text') {
                    const textEl = el as TextElement;
                    el = {
                        ...textEl,
                        fontFamily: textEl.fontFamily ?? DEFAULT_TEXT_PROPERTIES.fontFamily,
                        fontSize: textEl.fontSize ?? DEFAULT_TEXT_PROPERTIES.fontSize,
                        fontWeight: textEl.fontWeight ?? DEFAULT_TEXT_PROPERTIES.fontWeight,
                        fontColor: textEl.fontColor ?? DEFAULT_TEXT_PROPERTIES.fontColor,
                        letterSpacing: textEl.letterSpacing ?? DEFAULT_TEXT_PROPERTIES.letterSpacing,
                        lineHeight: textEl.lineHeight ?? DEFAULT_TEXT_PROPERTIES.lineHeight,
                        align: textEl.align ?? DEFAULT_TEXT_PROPERTIES.align,
                        verticalAlign: textEl.verticalAlign ?? DEFAULT_TEXT_PROPERTIES.verticalAlign,
                    };
                }
                elementsRecord[el.id] = el;
            });
            return {
                ...state,
                elements: elementsRecord,
                selectedElementIds: [], // Clear selection on reset
            };
        }

        default:
            return state;
    }
};

export const AppStateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(appStateReducer, initialState);
    return <AppStateContext.Provider value={{ state, dispatch }}>{children}</AppStateContext.Provider>;
};

export const useAppState = () => {
    const context = useContext(AppStateContext);
    if (context === undefined) {
        throw new Error('useAppState must be used within an AppStateProvider');
    }
    return context;
};