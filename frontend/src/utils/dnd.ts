/**
 * The custom data format identifier for dragging a component definition.
 * Using a custom type is more robust than relying on 'text/plain'.
 */
export const DND_FORMAT_COMPONENT = 'application/x-parsec-component-definition';

/**
 * The shape of the data being transferred during a component drag operation.
 */
export interface ComponentDragData {
  definitionId: string;
  offsetX: number; // Ratio of horizontal cursor position within the element
  offsetY: number; // Ratio of vertical cursor position within the element
}