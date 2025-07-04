// parsec-frontend/src/state/AppStateContext.tsx

import React, { createContext, useReducer, useContext, Dispatch } from 'react';
import type { AppState, Action, CanvasElement, ComponentDefinition, WorkspaceState } from './types';

const initialState: AppState = {
  elements: {},
  componentDefinitions: {}, // NEW: Initialize the component definitions registry
  selectedElementIds: [],
  groupEditingId: null,
  activeTool: 'select',
  editingElementId: null,
};

const AppStateContext = createContext<{
  state: AppState;
  dispatch: Dispatch<Action>;
} | undefined>(undefined);

const appStateReducer = (state: AppState, action: Action): AppState => {
  // console.log(`%c Reducer: ${action.type}`, 'color: #7f00ff; font-weight: bold;', action.payload);

  switch (action.type) {
    case 'SET_WORKSPACE_STATE': {
      // Destructure the payload which now contains elements and definitions
      const { elements, componentDefinitions } = action.payload as WorkspaceState;

      // Normalize elements into a Record by ID
      const elementsMap = elements.reduce((acc, el) => {
        acc[el.id] = el;
        return acc;
      }, {} as Record<string, CanvasElement>);

      // Normalize component definitions into a Record by ID
      const definitionsMap = componentDefinitions.reduce((acc, def) => {
        acc[def.id] = def;
        return acc;
      }, {} as Record<string, ComponentDefinition>);

      return { ...state, elements: elementsMap, componentDefinitions: definitionsMap };
    }
    
    // NEW: Handle the creation of a single new component definition
    case 'COMPONENT_DEFINITION_CREATED': {
        return {
            ...state,
            componentDefinitions: {
                ...state.componentDefinitions,
                [action.payload.id]: action.payload
            }
        };
    }

    case 'ELEMENT_CREATED':
    case 'ELEMENT_UPDATED': {
      return {
        ...state,
        elements: { ...state.elements, [action.payload.id]: action.payload },
      };
    }

    case 'ELEMENTS_UPDATED': {
      const updatedElements = { ...state.elements };
      action.payload.forEach(element => {
        updatedElements[element.id] = element;
      });
      return { ...state, elements: updatedElements };
    }

    case 'ELEMENT_DELETED': {
      const newElements = { ...state.elements };
      delete newElements[action.payload.id];
      return {
        ...state,
        elements: newElements,
        selectedElementIds: state.selectedElementIds.filter(id => id !== action.payload.id),
        // If the element being edited was deleted, stop editing it.
        editingElementId: state.editingElementId === action.payload.id ? null : state.editingElementId,
      };
    }

    case 'SET_SELECTION': {
      // When selection changes, we should stop editing any element.
      return { ...state, selectedElementIds: action.payload.ids, groupEditingId: null, editingElementId: null };
    }

    case 'ADD_TO_SELECTION': {
      if (state.selectedElementIds.includes(action.payload.id)) return state;
      return { ...state, selectedElementIds: [...state.selectedElementIds, action.payload.id], groupEditingId: null };
    }

    case 'REMOVE_FROM_SELECTION': {
      return { ...state, selectedElementIds: state.selectedElementIds.filter(id => id !== action.payload.id), groupEditingId: null };
    }

    case 'ENTER_GROUP_EDITING': {
      return {
        ...state,
        groupEditingId: action.payload.groupId,
        selectedElementIds: [action.payload.elementId],
        editingElementId: null, // Stop editing when entering a group
      };
    }

    case 'EXIT_GROUP_EDITING': {
      return {
        ...state,
        selectedElementIds: state.groupEditingId ? [state.groupEditingId] : [],
        groupEditingId: null,
        editingElementId: null, // Also stop editing when exiting a group
      };
    }

    case 'SET_ACTIVE_TOOL': {
      return {
        ...state,
        activeTool: action.payload.tool,
        selectedElementIds: [],
        groupEditingId: null,
        editingElementId: null, // Also stop editing when changing tools
      };
    }
    
    case 'SET_EDITING_ELEMENT_ID': {
      const { id } = action.payload;
      return {
        ...state,
        editingElementId: id,
        // When we start editing an element, it should be the only selected thing.
        // And we should not be in group editing mode.
        selectedElementIds: id ? [id] : [],
        groupEditingId: null,
      };
    }

    default:
      return state;
  }
};

export const AppStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appStateReducer, initialState);
  return (<AppStateContext.Provider value={{ state, dispatch }}>{children}</AppStateContext.Provider>);
};

export const useAppState = () => {
  const context = useContext(AppStateContext);
  if (context === undefined) throw new Error('useAppState must be used within an AppStateProvider');
  return context;
};