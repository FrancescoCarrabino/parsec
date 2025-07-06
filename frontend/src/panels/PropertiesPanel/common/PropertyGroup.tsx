// src/panels/PropertiesPanel/common/PropertyGroup.tsx
import React, { useState } from 'react';
import styles from '../PropertiesPanel.module.css'; // Import the shared module
import { ChevronDown, ChevronRight } from 'lucide-react'; // Import icons

interface PropertyGroupProps {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean; // Add option for initial state
}

export const PropertyGroup: React.FC<PropertyGroupProps> = ({ title, children, defaultOpen = true }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className={styles.propertyGroup}>
            <div className={styles.propertyGroupTitle} onClick={() => setIsOpen(!isOpen)}>
                {title}
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />} {/* Use icons with size */}
            </div>
            {isOpen && <div className={styles.propertyGroupContent}>{children}</div>}
        </div>
    );
};