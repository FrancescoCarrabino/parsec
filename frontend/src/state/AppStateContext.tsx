// parsec-frontend/src/state/AppStateContext.tsx
import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import type { AppState, Action, CanvasElement, FrameElement, ComponentDefinition, WorkspaceState } from './types';

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
                elementsRecord[el.id] = el;
            });
            const componentDefinitionsRecord = action.payload.componentDefinitions.reduce((acc, def) => {
                acc[def.id] = def;
                return acc;
            }, {} as Record<string, ComponentDefinition>);

            return { ...initialState, elements: elementsRecord, componentDefinitions: componentDefinitionsRecord };
        }
        case 'ELEMENT_CREATED':
            return { ...state, elements: { ...state.elements, [action.payload.id]: action.payload } };
        case 'ELEMENT_UPDATED':
            return { ...state, elements: { ...state.elements, [action.payload.id]: action.payload } };
        case 'ELEMENTS_UPDATED': {
            const newElements = { ...state.elements };
            action.payload.forEach(el => {
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
            return { ...state, groupEditingId: null, selectedElementIds: [state.groupEditingId || ''] };
        case 'SET_ACTIVE_TOOL':
            return { ...state, activeTool: action.payload.tool };
        case 'SET_EDITING_ELEMENT_ID':
            return { ...state, editingElementId: action.payload.id };

        // --- CORRECTED PRESENTATION LOGIC ---
        case 'START_PRESENTATION': {
            // THIS IS THE LOGIC THAT WAS MISSING. IT IS NOW RESTORED.
            // 1. Get all frames that are designated as slides.
            const slides = Object.values(state.elements)
                .filter(el => el.element_type === 'frame' && (el as FrameElement).presentationOrder !== null) as FrameElement[];
            
            // 2. Sort them by their presentation order to get the correct sequence.
            slides.sort((a, b) => a.presentationOrder! - b.presentationOrder!);
            
            // 3. Determine the starting index.
            let startIndex = 0;
            if (state.selectedElementIds.length === 1) {
                const foundIndex = slides.findIndex(s => s.id === state.selectedElementIds[0]);
                // If the selected element is a slide, start there. Otherwise, default to 0.
                if (foundIndex !== -1) {
                    startIndex = foundIndex;
                }
            }

            // Now, return the new state using the correctly calculated startIndex.
            return {
                ...state,
                presentation: {
                    isActive: true,
                    currentSlideIndex: startIndex,
                    presenterWindow: null,
                }
            };
        }
        case 'STOP_PRESENTATION':
            // This case doesn't need the presenterWindow logic anymore, as the component handles it.
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