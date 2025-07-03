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
    // node.getAbsolutePosition() returns the position of the node relative to the top-left
    // of the stage container. This is the true "World Space" position.
    const pos = element.getAbsolutePosition();
    
    // We need the scaled width and height of the element.
    const width = element.width() * element.scaleX();
    const height = element.height() * element.scaleY();
  
    // Note: This logic assumes non-rotated rectangles. For rotated elements,
    // we would need to calculate the bounding box of the rotated vertices.
    // For this version, we will proceed with the non-rotated bounding box.
    const x = pos.x;
    const y = pos.y;
    
    return {
      vertical: [
        { value: x, orientation: 'V', snapPoints: [y, y + height] },
        { value: x + width / 2, orientation: 'V', snapPoints: [y, y + height] },
        { value: x + width, orientation: 'V', snapPoints: [y, y + height] },
      ],
      horizontal: [
        { value: y, orientation: 'H', snapPoints: [x, x + width] },
        { value: y + height / 2, orientation: 'H', snapPoints: [x, x + width] },
        { value: y + height, orientation: 'H', snapPoints: [x, x + width] },
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
    let minV = Infinity;
    for (const dragged of draggedLines.vertical) {
      for (const target of targetLines.vertical) {
        const diff = Math.abs(dragged.value - target.value);
        if (diff < minV) { minV = diff; }
      }
    }
  
    if (minV < SNAP_THRESHOLD) {
      for (const dragged of draggedLines.vertical) {
        for (const target of targetLines.vertical) {
          const diff = Math.abs(dragged.value - target.value);
          if (diff < SNAP_THRESHOLD) {
              // Find the union of the two lines to draw the guide
              const allPoints = [...target.snapPoints, ...dragged.snapPoints];
              const minPoint = Math.min(...allPoints);
              const maxPoint = Math.max(...allPoints);
            result.vertical.push({
              line: [target.value, minPoint, target.value, maxPoint],
              snap: target.value,
              offset: target.value - dragged.value,
              orientation: 'V',
            });
          }
        }
      }
    }
  
    let minH = Infinity;
    for (const dragged of draggedLines.horizontal) {
      for (const target of targetLines.horizontal) {
        const diff = Math.abs(dragged.value - target.value);
        if (diff < minH) { minH = diff; }
      }
    }
  
    if (minH < SNAP_THRESHOLD) {
      for (const dragged of draggedLines.horizontal) {
        for (const target of targetLines.horizontal) {
          const diff = Math.abs(dragged.value - target.value);
          if (diff < SNAP_THRESHOLD) {
              const allPoints = [...target.snapPoints, ...dragged.snapPoints];
              const minPoint = Math.min(...allPoints);
              const maxPoint = Math.max(...allPoints);
            result.horizontal.push({
              line: [minPoint, target.value, maxPoint, target.value],
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