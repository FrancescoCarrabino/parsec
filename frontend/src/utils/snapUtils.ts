// parsec-frontend/src/canvas/utils/snapUtils.ts

import Konva from 'konva';
import type { CanvasElement } from '../../state/types';

// The distance in pixels at which snapping should occur.
const SNAP_THRESHOLD = 5;

/**
 * Defines the structure for a "snap line" which can be horizontal or vertical.
 * 'value' is the x or y coordinate of the line.
 * 'orientation' specifies if it's 'V' (Vertical) or 'H' (Horizontal).
 * 'snapPoints' are the specific points on an element's edge that define this line.
 */
export interface SnapLine {
  value: number;
  orientation: 'V' | 'H';
  snapPoints: number[];
}

/**
 * Defines the structure for a "guide line" that is rendered on the canvas.
 * It's a visual representation of a snap that has occurred.
 * 'line' is an array of coordinates [x1, y1, x2, y2].
 * 'snap' is the coordinate where the snap happened.
 * 'offset' is the distance we moved the element to make it snap.
 */
export interface Guide {
  line: number[];
  snap: number;
  offset: number;
  orientation: 'V' | 'H';
}

/**
 * Calculates all possible vertical and horizontal snap lines for a given element.
 * These lines correspond to the element's edges and its center.
 * @param element - The canvas element to generate lines for.
 * @returns An object containing arrays of vertical and horizontal SnapLines.
 */
export const getElementSnapLines = (element: Konva.Node): { vertical: SnapLine[], horizontal: SnapLine[] } => {
  const box = element.getClientRect(); // Use client rect for absolute coordinates on canvas
  
  return {
    vertical: [
      { value: box.x, orientation: 'V', snapPoints: [box.y, box.y + box.height] },
      { value: box.x + box.width / 2, orientation: 'V', snapPoints: [box.y, box.y + box.height] },
      { value: box.x + box.width, orientation: 'V', snapPoints: [box.y, box.y + box.height] },
    ],
    horizontal: [
      { value: box.y, orientation: 'H', snapPoints: [box.x, box.x + box.width] },
      { value: box.y + box.height / 2, orientation: 'H', snapPoints: [box.x, box.x + box.width] },
      { value: box.y + box.height, orientation: 'H', snapPoints: [box.x, box.x + box.width] },
    ],
  };
};

/**
 * The main snapping engine.
 * It takes the snap lines of the element being dragged and a list of all possible
 * target lines (from other elements) and finds the best snap points.
 * @param draggedLines - The vertical and horizontal snap lines for the element being moved.
 * @param targetLines - All possible vertical and horizontal lines from static elements.
 * @returns An object with the best snapping guides found for vertical and horizontal orientations.
 */
export const getGuides = (
  draggedLines: { vertical: SnapLine[], horizontal: SnapLine[] },
  targetLines: { vertical: SnapLine[], horizontal: SnapLine[] }
): { vertical: Guide[], horizontal: Guide[] } => {
  const result: { vertical: Guide[], horizontal: Guide[] } = { vertical: [], horizontal: [] };

  // --- Find best vertical snap ---
  let minV = Infinity;
  for (const dragged of draggedLines.vertical) {
    for (const target of targetLines.vertical) {
      const diff = Math.abs(dragged.value - target.value);
      if (diff < minV) {
        minV = diff;
      }
    }
  }

  if (minV < SNAP_THRESHOLD) {
    for (const dragged of draggedLines.vertical) {
      for (const target of targetLines.vertical) {
        const diff = Math.abs(dragged.value - target.value);
        if (diff < SNAP_THRESHOLD) {
          result.vertical.push({
            line: [target.value, ...target.snapPoints, target.value, ...dragged.snapPoints],
            snap: target.value,
            offset: target.value - dragged.value,
            orientation: 'V',
          });
        }
      }
    }
  }

  // --- Find best horizontal snap ---
  let minH = Infinity;
  for (const dragged of draggedLines.horizontal) {
    for (const target of targetLines.horizontal) {
      const diff = Math.abs(dragged.value - target.value);
      if (diff < minH) {
        minH = diff;
      }
    }
  }

  if (minH < SNAP_THRESHOLD) {
    for (const dragged of draggedLines.horizontal) {
      for (const target of targetLines.horizontal) {
        const diff = Math.abs(dragged.value - target.value);
        if (diff < SNAP_THRESHOLD) {
          result.horizontal.push({
            line: [...target.snapPoints, target.value, ...dragged.snapPoints, target.value],
            snap: target.value,
            offset: target.value - dragged.value,
            orientation: 'H',
          });
        }
      }
    }
  }

  return result;
};


/**
 * Calculates the final snapped position of a node.
 * @param guides - The active horizontal and vertical guides.
 * @param node - The Konva node being dragged.
 * @returns The new x and y coordinates for the node.
 */
export const getSnappedPosition = (guides: Guide[], node: Konva.Node): { x: number, y: number } => {
    let x = node.x();
    let y = node.y();

    const verticalGuide = guides.find(g => g.orientation === 'V');
    if (verticalGuide) {
        x += verticalGuide.offset;
    }

    const horizontalGuide = guides.find(g => g.orientation === 'H');
    if (horizontalGuide) {
        y += horizontalGuide.offset;
    }

    return { x, y };
};