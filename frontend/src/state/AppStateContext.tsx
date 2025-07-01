import React, { createContext, useReducer, useContext, Dispatch } from 'react';
import type { AppState, Action, CanvasElement } from './types';

const initialState: AppState = {
  elements: {},
  selectedElementIds: [],
  groupEditingId: null,
  activeTool: 'select', // Default to select tool
};

const AppStateContext = createContext<{
  state: AppState;
  dispatch: Dispatch<Action>;
} | undefined>(undefined);

const appStateReducer = (state: AppState, action: Action): AppState => {
  // Optional: log every action for easier debugging
  // console.log(`%c Reducer: ${action.type}`, 'color: #7f00ff; font-weight: bold;', action.payload);

  switch (action.type) {
    case 'SET_WORKSPACE_STATE': {
      const elementsMap = action.payload.reduce((acc, el) => {
        acc[el.id] = el;
        return acc;
      }, {} as Record<string, CanvasElement>);
      return { ...state, elements: elementsMap };
    }

    case 'ELEMENT_CREATED':
    case 'ELEMENT_UPDATED': {
      return {
        ...state,
        elements: { ...state.elements, [action.payload.id]: action.payload },
      };
    }

    case 'ELEMENTS_UPDATED': {
      // By wrapping this case in curly braces, `updatedElements` has its own scope.
      const updatedElements = { ...state.elements };
      action.payload.forEach(element => {
        updatedElements[element.id] = element;
      });
      return { ...state, elements: updatedElements };
    }

    case 'ELEMENT_DELETED': {
      // This `newElements` is now safely scoped and does not conflict with any others.
      const newElements = { ...state.elements };
      delete newElements[action.payload.id];
      return {
        ...state,
        elements: newElements,
        selectedElementIds: state.selectedElementIds.filter(id => id !== action.payload.id),
      };
    }

    case 'SET_SELECTION': {
      return { ...state, selectedElementIds: action.payload.ids, groupEditingId: null };
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
      };
    }

    case 'EXIT_GROUP_EDITING': {
      return {
        ...state,
        selectedElementIds: state.groupEditingId ? [state.groupEditingId] : [],
        groupEditingId: null,
      };
    }

    case 'SET_ACTIVE_TOOL': {
      // When changing tools, it's good practice to clear any selection.
      return {
        ...state,
        activeTool: action.payload.tool,
        selectedElementIds: [],
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
