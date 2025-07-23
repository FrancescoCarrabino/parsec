// src/panels/AssetsPanel/AssetIcon.tsx
import React from 'react';
import type { AssetType } from '../../state/types';

// --- CORRECTED IMPORTS START ---
// Import Font Awesome (Fa) icons from the 'fa' submodule
import {
  FaFileImage,
  FaFileCsv,
  FaFileAlt,    // for plain text
  FaFileCode,   // for markdown (or FaMarkdown from 'react-icons/fa')
  FaFile,       // for 'other'
} from 'react-icons/fa';

// Import Simple Icons (Si) from the 'si' submodule
import {
  PiFilePdf,  // <-- Corrected: Capital A, R
  PiMicrosoftExcelLogo,      // <-- Corrected: Capital E
  PiMicrosoftPowerpointLogo, // <-- Corrected: Capital P
} from 'react-icons/pi';
// --- CORRECTED IMPORTS END ---


// The map remains the same, as it now references correctly imported components
const iconMap: Record<AssetType, React.FC> = {
  image: FaFileImage,
  pdf: PiFilePdf,
  spreadsheet: PiMicrosoftExcelLogo,
  csv: FaFileCsv,
  text: FaFileAlt,
  presentation: PiMicrosoftPowerpointLogo,
  markdown: FaFileCode,
  other: FaFile,
};

export const AssetIcon = ({ type }: { type: AssetType }) => {
  // This log is no longer strictly necessary but can be kept for debugging.
  // console.log(`[AssetIcon] Rendering icon for type: "${type}"`);

  const IconComponent = Object.prototype.hasOwnProperty.call(iconMap, type) 
    ? iconMap[type] 
    : iconMap.other;
  
  return <IconComponent size={32} />;
};