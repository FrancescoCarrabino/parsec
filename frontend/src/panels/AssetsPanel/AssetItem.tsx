import React from 'react';
import type { AssetItem as AssetItemType } from '../../state/types';
import { AssetIcon } from './AssetIcon';
import styles from './AssetsPanel.module.css';
import { webSocketClient } from '../../api/websocket_client'; // <-- Import the WebSocket client

interface AssetItemProps {
  asset: AssetItemType;
}

export const AssetItem = ({ asset }: AssetItemProps) => {
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('application/parsec-asset', JSON.stringify(asset));
    e.dataTransfer.effectAllowed = 'copy';
  };

  // --- NEW: Context Menu Handler ---
  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    // Prevent the default browser right-click menu
    e.preventDefault(); 
    
    // Check if the asset is a type we can analyze
    if (asset.type === 'spreadsheet' || asset.type === 'csv') {
      // Use a simple prompt to get the user's objective
      const userObjective = window.prompt(
        `What would you like to analyze in "${asset.name}"?`,
        "Create a bar chart of sales by region" // A helpful default example
      );

      // If the user entered something and didn't cancel
      if (userObjective && userObjective.trim()) {
        // Construct the full prompt including the asset ID, as we designed
        const fullPrompt = `${userObjective} (asset: ${asset.id})`;
        
        // Call the new method on our WebSocket client to start the session
        webSocketClient.startAnalysis(fullPrompt);
      }
    } else {
      // Provide feedback if the asset type is not supported
      alert("This asset type cannot be analyzed by the AI.");
    }
  };

  return (
    <div
      className={styles.assetItem}
      title={asset.name}
      draggable="true"
      onDragStart={handleDragStart}
      onContextMenu={handleContextMenu} // <-- ADD THE CONTEXT MENU HANDLER HERE
    >
      <div className={styles.iconPreview}>
        {/* This is the existing logic for displaying image previews or icons */}
        {asset.type === 'image' && asset.url ? (
          <img 
            src={asset.url} 
            alt={asset.name} 
            className={styles.imagePreview}
            onDragStart={(e) => e.preventDefault()}
          />
        ) : (
          <AssetIcon type={asset.type} />
        )}
      </div>
      <div className={styles.assetName}>{asset.name}</div>
    </div>
  );
};