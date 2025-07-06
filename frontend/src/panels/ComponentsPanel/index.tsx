import React, { memo } from 'react';
import { useAppState } from '../../state/AppStateContext';
import type { ComponentDefinition } from '../../state/types';
// Assuming dnd.ts is at the root of src/utils
import type { DND_FORMAT_COMPONENT, ComponentDragData } from '../../utils/dnd';
import styles from './ComponentsPanel.module.css'; // Use the correct CSS module path

const ComponentItem = memo(function ComponentItem({ definition }: { definition: ComponentDefinition }) {
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.effectAllowed = 'copy';
    const dragData: ComponentDragData = {
      definitionId: definition.id,
      offsetX: e.nativeEvent.offsetX / e.currentTarget.offsetWidth,
      offsetY: e.nativeEvent.offsetY / e.currentTarget.offsetHeight,
    };
    e.dataTransfer.setData(DND_FORMAT_COMPONENT, JSON.stringify(dragData));
  };

  return (
    <div
      className={styles.componentItem}
      draggable="true"
      onDragStart={handleDragStart}
      title={`Drag to add "${definition.name}" to the canvas`}
    >
      <div className={styles.componentName}>{definition.name}</div>
      <div className={styles.componentInfo}>
        {definition.template_elements.length} elements
      </div>
    </div>
  );
});

export const ComponentsPanel = () => {
  const { state } = useAppState();
  const componentDefinitions = Object.values(state.componentDefinitions);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Components</div>
      <div className={styles.componentList}> {/* Add a wrapper for better spacing control */}
        {componentDefinitions.length === 0 ? (
          <div className={styles.noComponentsMessage}>
            No components defined yet. Select elements and use the AI prompt to create one.
          </div>
        ) : (
          componentDefinitions.map(def => (
            <ComponentItem key={def.id} definition={def} />
          ))
        )}
      </div>
    </div>
  );
};