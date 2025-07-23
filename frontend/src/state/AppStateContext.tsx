import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import type { AppState, Action, CanvasElement, FrameElement, ComponentDefinition, WorkspaceState, TextElement, BaseElement, AssetItem } from './types';

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
    assets: {},
    selectedElementIds: [],
    groupEditingId: null,
    activeTool: 'select',
    editingElementId: null,
    presentation: {
        isActive: false,
        currentSlideIndex: 0,
        presenterWindow: null,
    },
    agentStatus: null,
    analysisSession: null,
};

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

    if (action.type === 'SET_WORKSPACE_STATE') {
        const payload = action.payload as WorkspaceState;
        const elementsRecord = (payload.elements || []).reduce((acc, el) => {
            if (el && el.id) acc[el.id] = withTextDefaults(el);
            return acc;
        }, {} as Record<string, CanvasElement>);

        const componentDefinitionsRecord = (payload.componentDefinitions || []).reduce((acc, def) => {
            if (def && def.id) acc[def.id] = def;
            return acc;
        }, {} as Record<string, ComponentDefinition>);

        // --- MODIFIED: Map backend asset structure to frontend AssetItem ---
        // The backend sends snake_case (asset_type, mime_type)
        const assetsRecord = (payload.assets || []).reduce((acc: Record<string, AssetItem>, backendAsset: any) => {
            if (backendAsset && backendAsset.id) {
                acc[backendAsset.id] = {
                    id: backendAsset.id,
                    name: backendAsset.name,
                    url: backendAsset.url,
                    type: backendAsset.asset_type,      // <-- Map snake_case to camelCase
                    mimeType: backendAsset.mime_type,  // <-- Map snake_case to camelCase
                };
            }
            return acc;
        }, {} as Record<string, AssetItem>);

        return { ...state, elements: elementsRecord, componentDefinitions: componentDefinitionsRecord, assets: assetsRecord };
    }
    
    if (action.type === 'ELEMENT_CREATED') {
        const newElement = withTextDefaults(action.payload);
        return { ...state, elements: { ...state.elements, [newElement.id]: newElement } };
    }

    if (action.type === 'ELEMENTS_UPDATED') {
        const updatedElementsRecord = { ...state.elements };
        action.payload.forEach(el => {
            if (el && el.id) updatedElementsRecord[el.id] = withTextDefaults(el);
        });
        return { ...state, elements: updatedElementsRecord };
    }

    if (action.type === 'ELEMENT_UPDATED') {
        const updatedElement = withTextDefaults(action.payload);
        return { ...state, elements: { ...state.elements, [updatedElement.id]: updatedElement } };
    }
    
    if (action.type === 'ELEMENT_DELETED') {
        const newElements = { ...state.elements };
        delete newElements[action.payload.id];
        const newSelection = state.selectedElementIds.filter(id => id !== action.payload.id);
        return { ...state, elements: newElements, selectedElementIds: newSelection };
    }

    if (action.type === 'COMPONENT_DEFINITION_CREATED') {
        return { ...state, componentDefinitions: { ...state.componentDefinitions, [action.payload.id]: action.payload } };
    }

    if (action.type === 'SET_SELECTION') {
        return { ...state, selectedElementIds: action.payload.ids };
    }

    if (action.type === 'ADD_TO_SELECTION') {
        if (state.selectedElementIds.includes(action.payload.id)) return state;
        return { ...state, selectedElementIds: [...state.selectedElementIds, action.payload.id] };
    }

    if (action.type === 'REMOVE_FROM_SELECTION') {
        return { ...state, selectedElementIds: state.selectedElementIds.filter(id => id !== action.payload.id) };
    }

    if (action.type === 'ENTER_GROUP_EDITING') {
        return { ...state, groupEditingId: action.payload.groupId, selectedElementIds: [action.payload.elementId] };
    }

    if (action.type === 'EXIT_GROUP_EDITING') {
        return { ...state, groupEditingId: null, selectedElementIds: state.groupEditingId ? [state.groupEditingId] : [] };
    }

    if (action.type === 'SET_ACTIVE_TOOL') {
        return { ...state, activeTool: action.payload.tool };
    }

    if (action.type === 'SET_EDITING_ELEMENT_ID') {
        return { ...state, editingElementId: action.payload.id };
    }

    if (action.type === 'START_PRESENTATION') {
        const slides = Object.values(state.elements).filter(el => el.element_type === 'frame' && (el as FrameElement).presentationOrder !== null) as FrameElement[];
        slides.sort((a, b) => (a.presentationOrder ?? 0) - (b.presentationOrder ?? 0));
        let startIndex = 0;
        if (state.selectedElementIds.length === 1) {
            const foundIndex = slides.findIndex(s => s.id === state.selectedElementIds[0]);
            if (foundIndex !== -1) startIndex = foundIndex;
        }
        return { ...state, presentation: { ...state.presentation, isActive: true, currentSlideIndex: startIndex } };
    }

    if (action.type === 'STOP_PRESENTATION') {
        return { ...state, presentation: { ...state.presentation, isActive: false, currentSlideIndex: 0 } };
    }
    
    if (action.type === 'NEXT_SLIDE') {
        const slideCount = Object.values(state.elements).filter(el => el.element_type === 'frame' && el.presentationOrder !== null).length;
        if (state.presentation.currentSlideIndex >= slideCount - 1) return state;
        return { ...state, presentation: { ...state.presentation, currentSlideIndex: state.presentation.currentSlideIndex + 1 } };
    }

    if (action.type === 'PREV_SLIDE') {
        if (state.presentation.currentSlideIndex <= 0) return state;
        return { ...state, presentation: { ...state.presentation, currentSlideIndex: state.presentation.currentSlideIndex - 1 } };
    }

    if (action.type === 'SET_SLIDE') {
        return { ...state, presentation: { ...state.presentation, currentSlideIndex: action.payload.index } };
    }

    if (action.type === 'WORKSPACE_RESET') {
        const elementsRecord = (action.payload.elements || []).reduce((acc, el) => {
            if (el && el.id) acc[el.id] = withTextDefaults(el);
            return acc;
        }, {} as Record<string, CanvasElement>);
        return { ...state, elements: elementsRecord, selectedElementIds: [] };
    }

    if (action.type === 'AGENT_STATUS_UPDATE') {
        return { ...state, agentStatus: action.payload };
    }

    if (action.type === 'CLEAR_AGENT_STATUS') {
        return { ...state, agentStatus: null };
    }

    // --- MODIFIED: Map the incoming backend asset to the frontend's AssetItem interface ---
    if (action.type === 'ADD_ASSET') {
        const backendAsset = action.payload as any; // Cast to 'any' to handle the snake_case from backend
        if (!backendAsset || !backendAsset.id) return state;

        // Create a new asset object that matches the frontend's AssetItem interface
        const newAsset: AssetItem = {
            id: backendAsset.id,
            name: backendAsset.name,
            url: backendAsset.url,
            type: backendAsset.asset_type,     // <-- The crucial mapping
            mimeType: backendAsset.mime_type, // <-- Map this as well
        };

        return {
            ...state,
            assets: {
                ...(state.assets || {}),
                [newAsset.id]: newAsset,
            },
        };
    }
    
    if (action.type === 'DELETE_ASSET') {
        const newAssets = { ...(state.assets || {}) };
        delete newAssets[action.payload.id];
        return {
            ...state,
            assets: newAssets,
        };
    }
    if (action.type === 'ANALYSIS_SESSION_STARTED') {
        return {
          ...state,
          // Create a new session object
          analysisSession: {
            sessionId: action.payload.sessionId,
            isActive: true,
            messages: [],
            currentCode: '// Waiting for the AI to begin...',
          },
          // Clear the old agent status indicator to make way for the new UI
          agentStatus: null,
        };
      }
    
      if (action.type === 'ANALYSIS_SESSION_ENDED') {
        return {
          ...state,
          analysisSession: null, // Clear the session
        };
      }
    
      if (action.type === 'ANALYSIS_CODE_UPDATED') {
        if (!state.analysisSession) return state; // Safety check
        return {
          ...state,
          analysisSession: {
            ...state.analysisSession,
            currentCode: action.payload.code,
          },
        };
      }
    
      if (action.type === 'ANALYSIS_MESSAGE_RECEIVED') {
        if (!state.analysisSession) return state; // Safety check
        return {
          ...state,
          analysisSession: {
            ...state.analysisSession,
            messages: [...state.analysisSession.messages, action.payload.message],
          },
        };
      }

    return state;
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