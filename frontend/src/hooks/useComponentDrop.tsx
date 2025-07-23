// src/hooks/useComponentDrop.tsx
import React from 'react';
import Konva from 'konva';
import { useAppState } from '../state/AppStateContext';
import { webSocketClient } from '../api/websocket_client';
// --- ADDED IMPORTS ---
import type { ComponentDefinition, AssetItem } from '../state/types';

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

    // The stage needs to know the pointer position from the drop event
    stage.setPointersPositions(e);
    const dropPosition = stage.getPointerPosition();
    if (!dropPosition) return;
    
    // =================================================================
    // MERGED LOGIC STARTS HERE
    // =================================================================
    
    // --- 1. TRY TO HANDLE ASSET DROP FIRST ---
    const assetDataString = e.dataTransfer.getData('application/parsec-asset');
    if (assetDataString) {
      try {
        const asset: AssetItem = JSON.parse(assetDataString);
        
        // Only create an image element on the canvas if the asset is an image
        if (asset.type === 'image') {
          // Create the new image element at the drop position
          const newImageElement = {
            element_type: 'image',
            src: asset.url,
            x: dropPosition.x,
            y: dropPosition.y,
            width: 200, // Default width, can be adjusted
            height: 200, // Default height, can be adjusted
            rotation: 0,
            name: asset.name,
          };
          // Send to backend to be created officially
          webSocketClient.sendCreateElement(newImageElement);
        } else {
          // Handle other asset types (e.g., send to an agent)
          console.log(`Dropped a non-image asset: ${asset.name} (Type: ${asset.type})`);
          // Example future action: webSocketClient.send({ type: "process_asset", payload: { assetId: asset.id } });
        }
        
        // IMPORTANT: We handled the drop, so we stop further execution.
        return; 

      } catch (err) {
        console.error("Failed to parse dropped asset data:", err);
        // Fall through in case of error, though it's unlikely to be a component.
      }
    }

    // --- 2. IF NOT AN ASSET, TRY TO HANDLE COMPONENT DROP ---
    // Using a custom MIME type 'application/parsec-component' is better practice.
    // Make sure your component drag source sets this key.
    const componentDataString = e.dataTransfer.getData('application/parsec-component');
    if (componentDataString) {
        try {
            const dragData = JSON.parse(componentDataString);
            const { definitionId, offsetX, offsetY } = dragData;
            const definition: ComponentDefinition | undefined = componentDefinitions[definitionId];
      
            if (!definition) {
              console.error(`Dropped component with unknown definition ID: ${definitionId}`);
              return;
            }
      
            // Your existing logic for calculating the final position is good.
            const templateWidth = definition.template_elements[0]?.width || 100;
            const templateHeight = definition.template_elements[0]?.height || 100;

            const finalX = dropPosition.x - (offsetX * templateWidth);
            const finalY = dropPosition.y - (offsetY * templateHeight);
            
            const newInstancePayload = {
              element_type: 'component_instance',
              definition_id: definition.id,
              x: finalX,
              y: finalY,
              // Backend will fill in other details based on the definition
            };
      
            webSocketClient.sendCreateElement(newInstancePayload);
            return; // Handled the component drop.
        
        } catch (err) {
            console.error("Failed to parse dropped component data:", err);
            return;
        }
    }

    // If we reach here, the dropped item was neither a recognized asset nor a component.
    console.log("Dropped an unrecognized item.");
  };

  return { handleDragOver, handleDrop };
};