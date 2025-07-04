// parsec-frontend/src/canvas/elements/ImageComponent.tsx
import React from 'react';
import { Image } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';
import useImage from 'use-image';
import type { ImageElement } from '../../state/types';

interface ImageComponentProps {
  element: ImageElement;
  isVisible: boolean;
  onDragStart: (e: KonvaEventObject<DragEvent>) => void;
  onDragMove: (e: KonvaEventObject<DragEvent>) => void;
  onDragEnd: (e: KonvaEventObject<DragEvent>) => void;
  onDblClick: (e: KonvaEventObject<MouseEvent>) => void;
}

const ImageComponent: React.FC<ImageComponentProps> = ({ element, ...props }) => {
  const [img, status] = useImage(element.src, 'anonymous');

  // Do not render anything until the image is loaded.
  if (status !== 'loaded') {
    return null;
  }

  const isDraggable = !element.parentId; // Only top-level elements are directly draggable for now

  return (
    <Image
      image={img}
      id={element.id}
      name={`${element.id} element`} // Match the class name for snapping
      x={element.x}
      y={element.y}
      width={element.width}
      height={element.height}
      rotation={element.rotation}
      visible={props.isVisible}
      draggable={isDraggable}
      // Pass all the event handlers from the renderer
      onDragStart={props.onDragStart}
      onDragMove={props.onDragMove}
      onDragEnd={props.onDragEnd}
      onDblClick={props.onDblClick}
    />
  );
};

export default ImageComponent;