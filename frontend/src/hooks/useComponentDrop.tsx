import React from 'react';
import Konva from 'konva';
import { useAppState } from '../state/AppStateContext';
import { webSocketClient } from '../api/websocket_client';
import type { ComponentDefinition } from '../state/types';

export const useComponentDrop = (stageRef: React.RefObject<Konva.Stage>) => {
  const { state } = useAppState();
  const { componentDefinitions } = state;

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); // Necessary to allow the drop event.
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const dragDataString = e.dataTransfer.getData('text/plain');
    if (!dragDataString) return;

    let dragData;
    try {
      dragData = JSON.parse(dragDataString);
    } catch (err) {
      console.error("Failed to parse drag data:", err);
      return;
    }

    const { definitionId, offsetX, offsetY } = dragData;
    const definition: ComponentDefinition | undefined = componentDefinitions[definitionId];

    if (!definition) {
      console.error(`Dropped component with unknown definition ID: ${definitionId}`);
      return;
    }

    const dropPosition = stage.getPointerPosition();
    if (!dropPosition) return;
    
    const scale = stage.scaleX();
    const finalX = dropPosition.x - (offsetX * (definition.template_elements[0]?.width || 0));
    const finalY = dropPosition.y - (offsetY * (definition.template_elements[0]?.height || 0));
    
    const newInstancePayload = {
      element_type: 'component_instance',
      definition_id: definition.id,
      x: finalX,
      y: finalY,
      // width/height/properties will be set by backend based on definition
    };

    webSocketClient.sendCreateElement(newInstancePayload);
  };

  return { handleDragOver, handleDrop };
};