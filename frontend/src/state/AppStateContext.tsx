import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import type { AppState, Action, CanvasElement, FrameElement, ComponentDefinition, WorkspaceState, TextElement, BaseElement } from './types';

// Define default properties for a new text element
const DEFAULT_TEXT_PROPERTIES: Omit<TextElement, keyof BaseElement | 'element_type' | 'content'> = {
    fontFamily: 'Inter',
    fontSize: 32,
    fontWeight: 400,
    fontColor: '#333333',
    letterSpacing: 0,
    lineHeight: 1.2,
    align: 'left',
    verticalAlign: 'top',
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
    agentStatus: null, // <-- ADDED: The new state slice initialized to null
};

// Helper function to avoid code duplication for applying text defaults
const withTextDefaults = (element: CanvasElement): CanvasElement => {
    if (element.element_type === 'text') {
        const textEl = element as TextElement;
        return {
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
    return element;
};


const appStateReducer = (state: AppState, action: Action): AppState => {
  console.log(`[Reducer] Action received: ${action.type}`, action.payload);
    switch (action.type) {
        case 'SET_WORKSPACE_STATE': {
            const elementsRecord = action.payload.elements.reduce((acc, el) => {
                acc[el.id] = withTextDefaults(el);
                return acc;
            }, {} as Record<string, CanvasElement>);

            const componentDefinitionsRecord = action.payload.componentDefinitions.reduce((acc, def) => {
                acc[def.id] = def;
                return acc;
            }, {} as Record<string, ComponentDefinition>);

            return { ...state, elements: elementsRecord, componentDefinitions: componentDefinitionsRecord };
        }

        case 'ELEMENT_CREATED': {
            const newElement = withTextDefaults(action.payload);
            return { ...state, elements: { ...state.elements, [newElement.id]: newElement } };
        }
        
        // ADDED: A case for creating multiple elements at once
        case 'ELEMENTS_CREATED': {
            const newElementsRecord = { ...state.elements };
            action.payload.forEach(el => {
                newElementsRecord[el.id] = withTextDefaults(el);
            });
            return { ...state, elements: newElementsRecord };
        }

        case 'ELEMENT_UPDATED': {
            const updatedElement = withTextDefaults(action.payload);
            return { ...state, elements: { ...state.elements, [updatedElement.id]: updatedElement } };
        }
        
        case 'ELEMENTS_UPDATED': {
            const updatedElementsRecord = { ...state.elements };
            action.payload.forEach(el => {
                updatedElementsRecord[el.id] = withTextDefaults(el);
            });
            return { ...state, elements: updatedElementsRecord };
        }

        case 'ELEMENT_DELETED': {
            const newElements = { ...state.elements };
            delete newElements[action.payload.id];
            // Also remove from selection if it was selected
            const newSelection = state.selectedElementIds.filter(id => id !== action.payload.id);
            return { ...state, elements: newElements, selectedElementIds: newSelection };
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

        // --- All selection and tool cases remain the same ---
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
            return { ...state, groupEditingId: null, selectedElementIds: state.groupEditingId ? [state.groupEditingId] : [] };
        case 'SET_ACTIVE_TOOL':
            return { ...state, activeTool: action.payload.tool };
        case 'SET_EDITING_ELEMENT_ID':
            return { ...state, editingElementId: action.payload.id };

        // --- All presentation and reset cases remain the same ---
        case 'START_PRESENTATION': {
            const slides = Object.values(state.elements)
                .filter(el => el.element_type === 'frame' && (el as FrameElement).presentationOrder !== null) as FrameElement[];
            slides.sort((a, b) => (a.presentationOrder ?? 0) - (b.presentationOrder ?? 0));
            let startIndex = 0;
            if (state.selectedElementIds.length === 1) {
                const foundIndex = slides.findIndex(s => s.id === state.selectedElementIds[0]);
                if (foundIndex !== -1) startIndex = foundIndex;
            }
            return { ...state, presentation: { isActive: true, currentSlideIndex: startIndex, presenterWindow: null } };
        }
        case 'STOP_PRESENTATION':
            return { ...state, presentation: { isActive: false, currentSlideIndex: 0, presenterWindow: null } };
        case 'NEXT_SLIDE': {
            const slideCount = Object.values(state.elements).filter(el => el.element_type === 'frame' && el.presentationOrder !== null).length;
            if (state.presentation.currentSlideIndex >= slideCount - 1) return state;
            return { ...state, presentation: { ...state.presentation, currentSlideIndex: state.presentation.currentSlideIndex + 1 } };
        }
        case 'PREV_SLIDE': {
            if (state.presentation.currentSlideIndex <= 0) return state;
            return { ...state, presentation: { ...state.presentation, currentSlideIndex: state.presentation.currentSlideIndex - 1 } };
        }
        case 'SET_SLIDE':
            return { ...state, presentation: { ...state.presentation, currentSlideIndex: action.payload.index } };
        case 'WORKSPACE_RESET': {
            const elementsRecord = action.payload.elements.reduce((acc, el) => {
                acc[el.id] = withTextDefaults(el);
                return acc;
            }, {} as Record<string, CanvasElement>);
            return { ...state, elements: elementsRecord, selectedElementIds: [], };
        }

        case 'AGENT_STATUS_UPDATE':
            return {
                ...state,
                agentStatus: action.payload,
            };

        case 'CLEAR_AGENT_STATUS':
            // The component will now be cleared by the user submitting a new prompt,
            // so we can make this action do nothing or reset to a clean initial state.
            // Let's reset it fully.
            return {
                ...state,
                agentStatus: null,
            };


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