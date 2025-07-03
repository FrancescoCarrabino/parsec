// parsec-frontend/src/canvas/hooks/usePathEditor.ts

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Group, Circle, Rect, Line, Path } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';
import { webSocketClient } from '../api/websocket_client';
import type { PathElement, PathPoint } from '../state/types';
import { buildSvgPath } from '../utils/pathUtils';
import { useAppState } from '../state/AppStateContext';

export const usePathEditor = (
  editingPath: PathElement | null,
  stageScale: number
) => {
  const { dispatch } = useAppState(); // Get the dispatch function from our global context.
  const localPointsRef = useRef<PathPoint[]>([]);
  const [previewPathData, setPreviewPathData] = useState('');

  useEffect(() => {
    if (editingPath) {
      localPointsRef.current = JSON.parse(JSON.stringify(editingPath.points));
      setPreviewPathData(buildSvgPath(localPointsRef.current, editingPath.isClosed));
    } else {
      localPointsRef.current = [];
      setPreviewPathData('');
    }
  }, [editingPath]);

  // --- REFACTORED to use dispatch ---
  const commitChanges = useCallback(() => {
    if (editingPath) {
      // The path object in the global state is now our source of truth.
      const finalElement = { ...editingPath, points: localPointsRef.current };

      // Dispatch the update to the global state for immediate UI feedback.
      dispatch({ type: 'ELEMENT_UPDATED', payload: finalElement });
      
      // Also send the final state to the backend.
      webSocketClient.sendElementUpdate({
        id: finalElement.id,
        points: finalElement.points,
      });
    }
  }, [editingPath, dispatch]);

  const handleDragMove = (e: KonvaEventObject<DragEvent>) => {
    if (!editingPath) return;
    setPreviewPathData(buildSvgPath(localPointsRef.current, editingPath.isClosed));
    e.target.getStage()?.getLayer()?.batchDraw();
  };

  const handleAnchorDragMove = (e: KonvaEventObject<DragEvent>, index: number) => {
    if (!editingPath) return;
    localPointsRef.current[index].x = e.target.x();
    localPointsRef.current[index].y = e.target.y();
    handleDragMove(e);
  };
  
  const handleHandleDragMove = (e: KonvaEventObject<DragEvent>, index: number, handleType: 'handleIn' | 'handleOut') => {
    if (!editingPath) return;
    const anchor = localPointsRef.current[index];
    const handlePos = { x: e.target.x() - anchor.x, y: e.target.y() - anchor.y };
    anchor[handleType] = handlePos;

    if (anchor.handleType === 'symmetrical') {
      const oppositeHandle = handleType === 'handleIn' ? 'handleOut' : 'handleIn';
      anchor[oppositeHandle] = { x: -handlePos.x, y: -handlePos.y };
    }
    handleDragMove(e);
  };
  
  // This now calls the refactored commitChanges.
  const handleDragEnd = () => {
    if (editingPath) {
      commitChanges();
    }
  };

  const handleAnchorMouseDown = (e: KonvaEventObject<MouseEvent>, index: number) => {
    if (e.evt.altKey && editingPath) {
      e.evt.preventDefault();
      const newPoints = JSON.parse(JSON.stringify(localPointsRef.current));
      const point = newPoints[index];
      if (!point.handleIn && !point.handleOut) {
        point.handleOut = { x: 30 / stageScale, y: 0 };
        point.handleIn = { x: -30 / stageScale, y: 0 };
        point.handleType = 'symmetrical';
        
        localPointsRef.current = newPoints;
        const finalElement = { ...editingPath, points: newPoints };
        
        // Dispatch and send to backend immediately for this structural change.
        dispatch({ type: 'ELEMENT_UPDATED', payload: finalElement });
        webSocketClient.sendElementUpdate({ id: finalElement.id, points: finalElement.points });
      }
    }
  };

  const editUI = editingPath ? (
    <Group x={editingPath.x} y={editingPath.y} rotation={editingPath.rotation}>
      <Path data={previewPathData} stroke="#007aff" strokeWidth={1 / stageScale} listening={false} dash={[4, 2]} />
      {localPointsRef.current.map((p, i) => (
        <React.Fragment key={`edit-controls-${i}`}>
          {p.handleIn && (<>
              <Line points={[p.x + p.handleIn.x, p.y + p.handleIn.y, p.x, p.y]} stroke="#007aff" strokeWidth={1 / stageScale} listening={false}/>
              <Rect x={p.x + p.handleIn.x - 4/stageScale} y={p.y + p.handleIn.y - 4/stageScale} width={8/stageScale} height={8/stageScale} fill="white" stroke="#007aff" strokeWidth={1/stageScale} draggable onDragMove={(e) => handleHandleDragMove(e, i, 'handleIn')} onDragEnd={handleDragEnd} />
          </>)}
          {p.handleOut && (<>
              <Line points={[p.x + p.handleOut.x, p.y + p.handleOut.y, p.x, p.y]} stroke="#007aff" strokeWidth={1/stageScale} listening={false}/>
              <Rect x={p.x + p.handleOut.x - 4/stageScale} y={p.y + p.handleOut.y - 4/stageScale} width={8/stageScale} height={8/stageScale} fill="white" stroke="#007aff" strokeWidth={1/stageScale} draggable onDragMove={(e) => handleHandleDragMove(e, i, 'handleOut')} onDragEnd={handleDragEnd} />
          </>)}
          <Circle
            x={p.x} y={p.y} radius={5 / stageScale} fill="white" stroke="#007aff"
            strokeWidth={1.5 / stageScale} draggable onDragMove={(e) => handleAnchorDragMove(e, i)} onDragEnd={handleDragEnd}
            onMouseDown={(e) => handleAnchorMouseDown(e, i)}
          />
        </React.Fragment>
      ))}
    </Group>
  ) : null;

  return { editUI };
};