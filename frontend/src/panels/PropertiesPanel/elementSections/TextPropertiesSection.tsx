// src/properties/TextPropertiesSection.tsx
import React from 'react';
import type { TextElement } from '../../../state/types';

import { PropertyRow, PropertyLabel, StringInput, ColorInput, SelectInput } from '../common/CommonControls';
import styles from '../PropertiesPanel.module.css'; // Import shared styles

import clsx from 'clsx';
import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react';

interface TextPropertiesSectionProps {
  element: TextElement;
  onPropertyChange: (updates: Partial<TextElement>) => void;
}

// --- Configuration for Font and Weight Selection ---
const FONT_OPTIONS = [
  { fontFamily: 'Inter', weights: [400, 500, 600, 700] },
  { fontFamily: 'Roboto', weights: [400, 700] },
  { fontFamily: 'Lato', weights: [400, 700] },
  { fontFamily: 'Montserrat', weights: [400, 600, 700] },
  { fontFamily: 'Playfair Display', weights: [400, 700] },
  { fontFamily: 'Source Code Pro', weights: [400, 600] },
];

const WEIGHT_MAP: { [key: number]: string } = {
  300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semi-Bold', 700: 'Bold', 800: 'Extra-Bold', 900: 'Black',
};

// Define DEFAULT_TEXT_PROPERTIES here if not imported
const DEFAULT_TEXT_PROPERTIES = {
    content: 'Type something...', fontFamily: 'Inter', fontSize: 16, fontWeight: 400,
    fontColor: '#000000', letterSpacing: 0, lineHeight: 1.2, align: 'left', verticalAlign: 'top',
};


export const TextPropertiesSection: React.FC<TextPropertiesSectionProps> = ({ element, onPropertyChange }) => {

  const handleFontFamilyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newFontFamily = e.target.value;
    const font = FONT_OPTIONS.find(f => f.fontFamily === newFontFamily);
    // Ensure the current weight is valid for the new font, or default to the first available weight.
    const currentWeight = element.fontWeight ?? DEFAULT_TEXT_PROPERTIES.fontWeight;
    const newWeight = font && font.weights.includes(currentWeight)
      ? currentWeight
      : font?.weights[0] ?? DEFAULT_TEXT_PROPERTIES.fontWeight; // Fallback to default if font or first weight is missing
    onPropertyChange({ fontFamily: newFontFamily, fontWeight: newWeight });
  };

  const handleWeightChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
     onPropertyChange({ fontWeight: parseInt(e.target.value, 10) || DEFAULT_TEXT_PROPERTIES.fontWeight });
  };

  const handleFontSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
     onPropertyChange({ fontSize: parseInt(e.target.value, 10) || DEFAULT_TEXT_PROPERTIES.fontSize });
  };

   const handleFontColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
     onPropertyChange({ fontColor: e.target.value });
  };

   const handleLineHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
     onPropertyChange({ lineHeight: parseFloat(e.target.value) || DEFAULT_TEXT_PROPERTIES.lineHeight });
  };

   const handleLetterSpacingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
     onPropertyChange({ letterSpacing: parseFloat(e.target.value) || DEFAULT_TEXT_PROPERTIES.letterSpacing });
  };

   const handleAlignChange = (align: 'left' | 'center' | 'right') => {
     onPropertyChange({ align: align });
  };

   const handleVerticalAlignChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
     onPropertyChange({ verticalAlign: e.target.value as 'top' | 'middle' | 'bottom' });
  };

  // Determine available weights for the currently selected font
  const availableWeights = FONT_OPTIONS.find(f => f.fontFamily === (element.fontFamily ?? DEFAULT_TEXT_PROPERTIES.fontFamily))?.weights || [DEFAULT_TEXT_PROPERTIES.fontWeight]; // Use default weight if font not found

  return (
    // Wrap all PropertyRows in the grid container to apply the two-column layout as defined in CSS
    <div className={styles.propertyGroupContent}>

      {/* Font Family Dropdown */}
      {/* Each PropertyRow is a row in the parent grid (.propertyGroupContent) */}
      <PropertyRow>
        <PropertyLabel>Font</PropertyLabel>
        <SelectInput value={element.fontFamily ?? DEFAULT_TEXT_PROPERTIES.fontFamily} onChange={handleFontFamilyChange}>
          {FONT_OPTIONS.map(font => (
            <option key={font.fontFamily} value={font.fontFamily}>
              {font.fontFamily}
            </option>
          ))}
        </SelectInput>
      </PropertyRow>

      {/* Font Weight - Separate PropertyRow */}
      <PropertyRow>
        <PropertyLabel>Weight</PropertyLabel>
        <SelectInput value={element.fontWeight ?? DEFAULT_TEXT_PROPERTIES.fontWeight} onChange={handleWeightChange}>
          {availableWeights.map(weight => (
            <option key={weight} value={weight}>
                  {WEIGHT_MAP[weight] || weight} {/* Display mapped name or number */}
            </option>
          ))}
        </SelectInput>
      </PropertyRow>

       {/* Font Size - Separate PropertyRow */}
       <PropertyRow>
        <PropertyLabel>Size</PropertyLabel>
        <StringInput type="number" value={String(element.fontSize ?? DEFAULT_TEXT_PROPERTIES.fontSize)} onChange={handleFontSizeChange} step="1" />
      </PropertyRow>


      {/* Font Color - Separate PropertyRow */}
      <PropertyRow>
        <PropertyLabel>Color</PropertyLabel>
        {/* ColorInput component handles its internal layout */}
        <ColorInput value={element.fontColor ?? DEFAULT_TEXT_PROPERTIES.fontColor} onChange={handleFontColorChange} />
      </PropertyRow>

      {/* Spacing Properties - Each in a separate PropertyRow */}
      <PropertyRow>
        <PropertyLabel>Line Height</PropertyLabel>
        <StringInput type="number" step="0.1" value={String(element.lineHeight ?? DEFAULT_TEXT_PROPERTIES.lineHeight)} onChange={handleLineHeightChange} />
      </PropertyRow>
      <PropertyRow>
        <PropertyLabel>Letter Spacing</PropertyLabel>
        <StringInput type="number" value={String(element.letterSpacing ?? DEFAULT_TEXT_PROPERTIES.letterSpacing)} onChange={handleLetterSpacingChange} step="0.1" />
      </PropertyRow>

      {/* Horizontal Alignment Buttons - Separate PropertyRow */}
      <PropertyRow>
        <PropertyLabel>Align</PropertyLabel>
        {/* The alignButtonGroup class is applied to the container div */}
        <div className={styles.alignButtonGroup}>
            <button onClick={() => handleAlignChange('left')} className={clsx(styles.alignButton, { [styles.active]: element.align === 'left' })}>
                <AlignLeft size={18} />
            </button>
            <button onClick={() => handleAlignChange('center')} className={clsx(styles.alignButton, { [styles.active]: element.align === 'center' })}>
                <AlignCenter size={18} />
            </button>
            <button onClick={() => handleAlignChange('right')} className={clsx(styles.alignButton, { [styles.active]: element.align === 'right' })}>
                <AlignRight size={18} />
            </button>
        </div>
      </PropertyRow>

      {/* Vertical Alignment Dropdown - Separate PropertyRow */}
      <PropertyRow>
        <PropertyLabel>V. Align</PropertyLabel>
         <SelectInput value={element.verticalAlign ?? DEFAULT_TEXT_PROPERTIES.verticalAlign} onChange={handleVerticalAlignChange}>
          <option value="top">Top</option>
          <option value="middle">Middle</option>
          <option value="bottom">Bottom</option>
        </SelectInput>
      </PropertyRow>
    </div>
  );
};