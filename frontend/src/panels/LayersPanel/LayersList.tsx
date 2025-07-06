import React, { useMemo } from 'react';
import { LayerItem } from './LayerItem';
import type { CanvasElement } from '../../state/types';
import styles from './LayersPanel.module.css';

interface LayersListProps {
    layers: CanvasElement[];
}

export const LayersList: React.FC<LayersListProps> = ({ layers }) => {
    const layerTree = useMemo(() => {
        const tree: React.ReactNode[] = [];
        const buildTree = (parentId: string | null, depth: number) => {
            layers.filter(el => el.parentId === parentId)
                  .sort((a, b) => b.zIndex - a.zIndex)
                  .forEach(element => {
                      tree.push(<LayerItem key={element.id} element={element} depth={depth} />);
                      if (element.element_type === 'frame' || element.element_type === 'group') {
                          buildTree(element.id, depth + 1);
                      }
                  });
        };
        buildTree(null, 0);
        return tree;
    }, [layers]);

    return <div className={styles.scrollableArea}>{layerTree}</div>; // Moved scrollableArea to the container
};