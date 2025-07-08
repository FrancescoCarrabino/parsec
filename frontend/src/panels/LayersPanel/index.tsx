import React, { useMemo } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useAppState } from '../../state/AppStateContext';
import { LayerItem } from './LayerItem';
// Import PresentationIcon properly and ensure it's styled
import { Presentation as PresentationIcon } from 'lucide-react'; // Assuming you've installed lucide-react
import type { CanvasElement, FrameElement } from '../../state/types';

import styles from './LayersPanel.module.css'; // Import the CSS Module

const LayersPanelComponent: React.FC = () => {
    const { state, dispatch } = useAppState();
    const { elements } = state;

    const sortedElements = useMemo(() => {
        const allElements = Object.values(elements);
        return allElements.sort((a, b) => {
            const aIsSlide = a.element_type === 'frame' && (a as FrameElement).presentationOrder !== null;
            const bIsSlide = b.element_type === 'frame' && (b as FrameElement).presentationOrder !== null;

            if (aIsSlide && bIsSlide) {
                return (a as FrameElement).presentationOrder! - (b as FrameElement).presentationOrder!;
            }
            if (aIsSlide) return -1; // Slides come first
            if (bIsSlide) return 1;
            return b.zIndex - a.zIndex; // Then sort by zIndex
        });
    }, [elements]);
    
    const layerTree = useMemo(() => {
        const tree: React.ReactNode[] = [];
        const buildTree = (parentId: string | null, depth: number) => {
            sortedElements.filter(el => el.parentId === parentId)
                .forEach(element => {
                    tree.push(<LayerItem key={element.id} element={element} depth={depth} />);
                    if (element.element_type === 'frame' || element.element_type === 'group') {
                        buildTree(element.id, depth + 1);
                    }
                });
        };
        buildTree(null, 0);
        return tree;
    }, [sortedElements]);

    const hasSlides = useMemo(() => sortedElements.some(el => el.element_type === 'frame' && (el as FrameElement).presentationOrder !== null), [sortedElements]);
    
    const handlePresent = () => {
        if (!hasSlides) return;
        dispatch({ type: 'START_PRESENTATION' });
    };

    return (
        <div className={styles.panel}>
            <div className={styles.header}>
                <span>Navigator</span>
                <button onClick={handlePresent} className={hasSlides ? styles.presentButton : styles.presentButtonDisabled} disabled={!hasSlides} title="Start Presentation">
                    <PresentationIcon size={18} className={styles.presentButtonIcon} /> Present
                </button>
            </div>
            
            <div className={styles.scrollableArea}>
                <div className={styles.sectionTitle}>Layers</div>
                <div>{layerTree}</div>
            </div>
        </div>
    );
};

export const LayersPanel: React.FC = () => {
    return (
        // DndProvider should ideally be higher up, but for this panel's scope, it's fine.
        // If you have multiple draggable components, consider moving it to App.tsx or main.tsx.
        <DndProvider backend={HTML5Backend}>
            <LayersPanelComponent />
        </DndProvider>
    );
}; 