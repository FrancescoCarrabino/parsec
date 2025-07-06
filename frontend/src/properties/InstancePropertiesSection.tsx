// parsec-frontend/src/properties/InstancePropertiesSection.tsx

import React from 'react';
import { useAppState } from '../state/AppStateContext';
import type { ComponentInstanceElement, ComponentDefinition, ComponentProperty } from '../state/types';
import { webSocketClient } from '../api/websocket_client';
// CORRECTED: Import from the new shared file.
import { PropertyGroup, PropertyRow, PropertyLabel, StringInput, ColorInput } from './CommonControls';

interface InstancePropertiesSectionProps {
  instance: ComponentInstanceElement;
  definition: ComponentDefinition;
}

const PropertyControl: React.FC<{ instance: ComponentInstanceElement; prop: ComponentProperty; }> = ({ instance, prop }) => {
  const currentValue = instance.properties[prop.prop_name];

  const handleValueChange = (newValue: any) => {
    const newProperties = { ...instance.properties, [prop.prop_name]: newValue };
    webSocketClient.sendElementUpdate({ id: instance.id, properties: newProperties });
  };

  switch (prop.prop_type) {
    case 'text':
      return (
        <PropertyRow>
          <PropertyLabel>{prop.prop_name.replace(/_/g, ' ')}</PropertyLabel>
          <StringInput value={currentValue ?? ''} onChange={(e) => handleValueChange(e.target.value)} />
        </PropertyRow>
      );
    case 'color':
       const colorValue = currentValue?.color ?? '#000000';
       return (
         <PropertyRow>
           <PropertyLabel>{prop.prop_name.replace(/_/g, ' ')}</PropertyLabel>
           <ColorInput value={colorValue} onChange={(e) => handleValueChange({ type: 'solid', color: e.target.value })} />
         </PropertyRow>
       );
    default:
      return null;
  }
};

export const InstancePropertiesSection: React.FC<InstancePropertiesSectionProps> = ({ instance, definition }) => {
  return (
    <div>
      <PropertyGroup title="Component Name">
        <PropertyRow>
          <div style={{ padding: '4px 8px', color: '#ccc', fontSize: '12px', fontStyle: 'italic' }}>
            {definition.name}
          </div>
        </PropertyRow>
      </PropertyGroup>
      
      <PropertyGroup title="Properties">
        {definition.schema.length === 0 ? (
          <div style={{ padding: '4px 8px', color: '#888', fontSize: '12px' }}>
            This component has no editable properties.
          </div>
        ) : (
          definition.schema.map(prop => (
            <PropertyControl key={prop.prop_name} instance={instance} prop={prop} />
          ))
        )}
      </PropertyGroup>
    </div>
  );
};