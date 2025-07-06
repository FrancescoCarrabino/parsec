// src/panels/PropertiesPanel/common/CommonControls.tsx
import React from 'react';
import styles from '../PropertiesPanel.module.css'; // Import the shared module
import clsx from 'clsx'; // For conditional classes

// Re-export PropertyGroup (defined in PropertyGroup.tsx) so other files can import from here
export { PropertyGroup } from './PropertyGroup';

export const PropertyRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className={styles.propertyRow}>
        {children}
    </div>
);

export const PropertyLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <label className={styles.propertyLabel}>{children}</label>
);

export const StringInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
    <input {...props} className={styles.stringInput} />
);

export const ColorInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <div className={styles.colorInputWrapper}>
    {/* Read-only text input to display hex value */}
    <input type="text" value={props.value} readOnly className={styles.colorInputText} />
    {/* The actual color picker */}
    <input {...props} type="color" className={styles.colorPicker} />
  </div>
);

export const SelectInput: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
    <select {...props} className={styles.selectInput}>
        {props.children}
    </select>
);


export const ActionButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = (props) => {
    // Determine if the button is disabled to apply appropriate styles
    const isDisabled = props.disabled;
    const buttonClasses = clsx(styles.actionButton, {
        [styles.disabledActionButton]: isDisabled,
    });

    return (
        // Spread props including onClick, disabled, etc.
        <button {...props} className={buttonClasses}>
            {props.children}
        </button>
    );
};