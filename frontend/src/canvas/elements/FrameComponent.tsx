import React, { useMemo } from 'react';
import { Rect } from 'react-konva';
import type { FrameElement } from '../../state/types';
import { applyFillToProps } from '../../utils/pathUtils';

interface FrameComponentProps { element: FrameElement; }

export const FrameComponent: React.FC<FrameComponentProps> = ({ element }) => {
  const konvaProps = useMemo(() => {
    const props: any = {};
    const { fill, stroke, strokeWidth, width, height, cornerRadius } = element;
    if (fill) { applyFillToProps(props, fill, width, height, 'fill'); }
    if (stroke) { props.strokeWidth = strokeWidth; applyFillToProps(props, stroke, width, height, 'stroke'); }
    if (cornerRadius) { props.cornerRadius = cornerRadius; }
    return props;
  }, [element.fill, element.stroke, element.strokeWidth, element.cornerRadius, element.width, element.height]);

  return <Rect width={element.width} height={element.height} {...konvaProps} />;
};