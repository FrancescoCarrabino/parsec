// src/panels/LayersPanel/index.tsx
import React, { useMemo } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useAppState } from '../../state/AppStateContext';
import { LayerItem } from './LayerItem';
import { PresentationIcon } from '../../icons/PresentationIcon';
import type { FrameElement } from '../../state/types';

// STYLES (Unchanged)
const panelStyle: React.CSSProperties = { width: '260px', flex: '1 1 100%', background: '#252627', color: '#ccc', padding: '0', boxSizing: 'border-box', fontFamily: 'sans-serif', fontSize: '13px', borderRight: '1px solid #444', overflowY: 'hidden', display: 'flex', flexDirection: 'column' };
const headerStyle: React.CSSProperties = { color: 'white', fontWeight: 'bold', padding: '16px 16px 8px 16px', borderBottom: '1px solid #444', fontSize: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 };
const sectionTitleStyle: React.CSSProperties = { color: '#888', textTransform: 'uppercase', fontSize: '11px', fontWeight: 'bold', padding: '16px 16px 8px 16px' };
const scrollableAreaStyle: React.CSSProperties = { flexGrow: 1, overflowY: 'auto', padding: '0 8px' };
const presentButtonStyle: React.CSSProperties = { background: '#007aff', color: 'white', border: 'none', borderRadius: '5px', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' };
const presentButtonDisabledStyle: React.CSSProperties = { ...presentButtonStyle, background: '#444', cursor: 'not-allowed' };


const LayersPanelComponent: React.FC = () => {
    const { state, dispatch } = useAppState();
    const { elements } = state;

    // This memo now just gets ALL elements, no more splitting.
    const sortedElements = useMemo(() => {
        const allElements = Object.values(elements);
        // Sort slides by their order, then everything else by z-index.
        // This naturally groups slides at the top if they have a low z-index.
        return allElements.sort((a, b) => {
            const aIsSlide = a.element_type === 'frame' && (a as FrameElement).presentationOrder !== null;
            const bIsSlide = b.element_type === 'frame' && (b as FrameElement).presentationOrder !== null;

            if (aIsSlide && bIsSlide) {
                return (a as FrameElement).presentationOrder! - (b as FrameElement).presentationOrder!;
            }
            // A simple way to group slides together, you can refine this logic
            if (aIsSlide) return -1;
            if (bIsSlide) return 1;

            return b.zIndex - a.zIndex;
        });
    }, [elements]);
    
    const layerTree = useMemo(() => {
        const tree: React.ReactNode[] = [];
        const buildTree = (parentId: string | null, depth: number) => {
            sortedElements.filter(el => el.parentId === parentId)
                // No need to sort again here, already sorted.
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
        <div style={panelStyle}>
            <div style={headerStyle}>
                <span>Navigator</span>
                <button onClick={handlePresent} style={hasSlides ? presentButtonStyle : presentButtonDisabledStyle} disabled={!hasSlides}>
                    <PresentationIcon /> Present
                </button>
            </div>
            
            <div style={scrollableAreaStyle}>
                <div style={sectionTitleStyle}>Layers</div>
                <div>{layerTree}</div>
            </div>
        </div>
    );
};

export const LayersPanel: React.FC = () => {
    return (
        <DndProvider backend={HTML5Backend}>
            <LayersPanelComponent />
        </DndProvider>
    );
};