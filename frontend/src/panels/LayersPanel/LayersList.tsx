// src/panels/LayersPanel/LayersList.tsx
import React, { useMemo } from 'react';
import { LayerItem } from './LayerItem';
import type { CanvasElement } from '../../state/types';

interface LayersListProps {
    layers: CanvasElement[];
}

export const LayersList: React.FC<LayersListProps> = ({ layers }) => {
    // This memo builds the flat, ordered array of JSX nodes to render.
    const layerTree = useMemo(() => {
        const tree: React.ReactNode[] = [];
        const buildTree = (parentId: string | null, depth: number) => {
            layers.filter(el => el.parentId === parentId)
                  .sort((a, b) => b.zIndex - a.zIndex) // sort by zIndex descending
                  .forEach(element => {
                      tree.push(<LayerItem key={element.id} element={element} depth={depth} />);
                      if (element.element_type === 'frame' || element.element_type === 'group') {
                          buildTree(element.id, depth + 1);
                      }
                  });
        };
        buildTree(null, 0); // Start building from the root
        return tree;
    }, [layers]);

    return <div>{layerTree}</div>;
};