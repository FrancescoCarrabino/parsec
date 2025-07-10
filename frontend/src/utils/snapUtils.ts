// parsec-frontend/src/canvas/utils/snapUtils.ts

import Konva from 'konva';
import { Transformer } from 'konva';

// The distance in pixels at which snapping should occur.
const SNAP_THRESHOLD = 8; // Increased slightly for a better feel

export interface SnapLine {
  value: number;
  orientation: 'V' | 'H';
  snapPoints: number[];
}

export interface Guide {
  line: number[];
  snap: number;
  offset: number;
  orientation: 'V' | 'H';
}

/**
 * Calculates all possible vertical and horizontal snap lines for a given Konva node.
 * These lines correspond to the element's edges and its center.
 * @param element - The Konva node to generate lines for.
 * @returns An object containing arrays of vertical and horizontal SnapLines.
 */
export const getElementSnapLines = (element: Konva.Node): { vertical: SnapLine[], horizontal: SnapLine[] } => {
  const pos = element.getAbsolutePosition();
  const width = element.width() * element.scaleX();
  const height = element.height() * element.scaleY();
  // Note: Assumes non-rotated rectangles. For rotated elements, this would require
  // calculating the bounding box of the rotated shape's vertices.
  const x = pos.x;
  const y = pos.y;

  return {
    vertical: [
      { value: x, orientation: 'V', snapPoints: [y, y + height] },           // Left
      { value: x + width / 2, orientation: 'V', snapPoints: [y, y + height] }, // Center
      { value: x + width, orientation: 'V', snapPoints: [y, y + height] },     // Right
    ],
    horizontal: [
      { value: y, orientation: 'H', snapPoints: [x, x + width] },           // Top
      { value: y + height / 2, orientation: 'H', snapPoints: [x, x + width] }, // Middle
      { value: y + height, orientation: 'H', snapPoints: [x, x + width] },     // Bottom
    ],
  };
};

/**
 * Generates snap lines for the stage itself (edges and center).
 * @param stage - The Konva Stage.
 * @returns An object containing arrays of vertical and horizontal SnapLines for the stage.
 */
export const getStageSnapLines = (stage: Konva.Stage): { vertical: SnapLine[], horizontal: SnapLine[] } => {
    const width = stage.width();
    const height = stage.height();
    return {
        vertical: [
            { value: 0, orientation: 'V', snapPoints: [0, height] },
            { value: width / 2, orientation: 'V', snapPoints: [0, height] },
            { value: width, orientation: 'V', snapPoints: [0, height] },
        ],
        horizontal: [
            { value: 0, orientation: 'H', snapPoints: [0, width] },
            { value: height / 2, orientation: 'H', snapPoints: [0, width] },
            { value: height, orientation: 'H', snapPoints: [0, width] },
        ]
    };
};


/**
 * The new, more accurate snapping engine.
 * It finds the single best snap distance and then collects ALL guides that match
 * that distance, merging them into one comprehensive guide line.
 * @param draggedLines - The snap lines for the element being moved or transformed.
 * @param targetLines - All possible static lines (from other elements and the stage).
 * @returns An object with the best `Guide` found for vertical and horizontal orientations, or null.
 */
export const findBestSnapGuides = (
  draggedLines: { vertical: SnapLine[], horizontal: SnapLine[] },
  targetLines: { vertical: SnapLine[], horizontal: SnapLine[] }
): { vertical: Guide | null, horizontal: Guide | null } => {
  const result: { vertical: Guide | null, horizontal: Guide | null } = { vertical: null, horizontal: null };
  const Epsilon = 0.5; // Use a small epsilon for floating point comparisons

  // --- VERTICAL SNAPPING ---
  // Pass 1: Find the minimum snap distance
  let minVDist = SNAP_THRESHOLD;
  draggedLines.vertical.forEach(dragged => {
    targetLines.vertical.forEach(target => {
      const diff = Math.abs(dragged.value - target.value);
      if (diff < minVDist) {
        minVDist = diff;
      }
    });
  });

  // Pass 2: Collect all guides that match the minimum distance
  if (minVDist < SNAP_THRESHOLD) {
    let bestV: Guide | null = null;
    const allSnapPoints: number[] = [];
    
    draggedLines.vertical.forEach(dragged => {
      targetLines.vertical.forEach(target => {
        const diff = Math.abs(dragged.value - target.value);
        // If this pair matches the minimum distance (within a small tolerance)
        if (Math.abs(diff - minVDist) < Epsilon) {
          // If this is the first match, establish the guide's core properties
          if (!bestV) {
            bestV = {
              snap: target.value,
              offset: target.value - dragged.value,
              orientation: 'V',
              line: [], // will be calculated last
            };
          }
          // Collect all points from both the target and dragged lines to calculate the guide's extent
          allSnapPoints.push(...target.snapPoints, ...dragged.snapPoints);
        }
      });
    });

    if (bestV) {
        // Calculate the final guide line that spans all collected snap points
        const minPoint = Math.min(...allSnapPoints);
        const maxPoint = Math.max(...allSnapPoints);
        bestV.line = [bestV.snap, minPoint, bestV.snap, maxPoint];
        result.vertical = bestV;
    }
  }


  // --- HORIZONTAL SNAPPING ---
  // Pass 1: Find the minimum snap distance
  let minHDist = SNAP_THRESHOLD;
  draggedLines.horizontal.forEach(dragged => {
    targetLines.horizontal.forEach(target => {
      const diff = Math.abs(dragged.value - target.value);
      if (diff < minHDist) {
        minHDist = diff;
      }
    });
  });

  // Pass 2: Collect all guides that match the minimum distance
  if (minHDist < SNAP_THRESHOLD) {
    let bestH: Guide | null = null;
    const allSnapPoints: number[] = [];

    draggedLines.horizontal.forEach(dragged => {
      targetLines.horizontal.forEach(target => {
        const diff = Math.abs(dragged.value - target.value);
        if (Math.abs(diff - minHDist) < Epsilon) {
          if (!bestH) {
            bestH = {
              snap: target.value,
              offset: target.value - dragged.value,
              orientation: 'H',
              line: [], // will be calculated last
            };
          }
          allSnapPoints.push(...target.snapPoints, ...dragged.snapPoints);
        }
      });
    });

    if (bestH) {
        const minPoint = Math.min(...allSnapPoints);
        const maxPoint = Math.max(...allSnapPoints);
        bestH.line = [minPoint, bestH.snap, maxPoint, bestH.snap];
        result.horizontal = bestH;
    }
  }

  return result;
};

// ... keep applyTransformSnap as it was in the previous answer. It's correct.
export const applyTransformSnap = (node: Konva.Node, tr: Transformer, bestSnaps: { vertical: Guide | null, horizontal: Guide | null }, stageScale: number) => {
    const anchor = tr.getActiveAnchor();
    if (!anchor) return;
    
    const { vertical: vSnap, horizontal: hSnap } = bestSnaps;

    const localVOffset = vSnap ? vSnap.offset / stageScale : 0;
    const localHOffset = hSnap ? hSnap.offset / stageScale : 0;

    if (vSnap) {
        if (anchor.includes('left')) {
            const currentLocalX = node.x();
            const newLocalX = currentLocalX + localVOffset;
            const deltaX = currentLocalX - newLocalX;
            node.x(newLocalX);
            node.width(node.width() + deltaX);
        } else if (anchor.includes('right')) {
            node.width(node.width() + localVOffset);
        } else {
            node.x(node.x() + localVOffset);
        }
    }

    if (hSnap) {
        if (anchor.includes('top')) {
            const currentLocalY = node.y();
            const newLocalY = currentLocalY + localHOffset;
            const deltaY = currentLocalY - newLocalY;
            node.y(newLocalY);
            node.height(node.height() + deltaY);
        } else if (anchor.includes('bottom')) {
            node.height(node.height() + localHOffset);
        } else {
            node.y(node.y() + localHOffset);
        }
    }
};