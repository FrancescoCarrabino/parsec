// parsec-frontend/src/canvas/elements/ImageComponent.tsx
import React from 'react';
import { Image } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';
import useImage from 'use-image';
import type { ImageElement } from '../../state/types';

interface ImageComponentProps {
    element: ImageElement;
    [key: string]: any; // Allows it to accept 'draggable', 'isVisible', handlers, etc.
  }
const ImageComponent: React.FC<ImageComponentProps> = ({ element, ...props }) => {
  const [img, status] = useImage(element.src, 'anonymous');

  // Do not render anything until the image is loaded.
  if (status !== 'loaded') {
    return null;
  }

  return (
    <Image
      image={img}
      id={element.id}
      name={`${element.id} element`}
      x={element.x}
      y={element.y}
      width={element.width}
      height={element.height}
      rotation={element.rotation}
      // --- MODIFICATION 3: APPLY ALL PROPS DIRECTLY ---
      // The '...props' object now contains everything we need:
      // - draggable: boolean
      // - isVisible: boolean (which we apply to the 'visible' prop)
      // - onDragStart, onDragMove, onDragEnd, onDblClick handlers
      visible={props.isVisible}
      {...props}
    />
  );
};

export default ImageComponent;