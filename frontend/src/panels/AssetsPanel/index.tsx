// src/panels/AssetsPanel/index.tsx
import React, { useMemo, useRef } from 'react'; // <-- Import useMemo
import { useAppState } from '../../state/AppStateContext';
import { useAssetManager } from '../../hooks/useAssetManager';
import { AssetItem } from './AssetItem';
import styles from './AssetsPanel.module.css';

export const AssetsPanel = () => {
  const { state } = useAppState();
  const { uploadAssets } = useAssetManager();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const assetList = Object.values(state.assets || {});

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    uploadAssets(e.target.files);
    e.target.value = '';
  };

  return (
    <div className={styles.panel}>
      <h2 className={styles.header}>Assets</h2>
      
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
        multiple
      />
      <button onClick={handleUploadClick} className={styles.uploadButton}>
        Upload File
      </button>

      {assetList.length > 0 ? (
        <div className={styles.assetGrid}>
          {assetList.map(asset => (
            <AssetItem key={asset.id} asset={asset} />
          ))}
        </div>
      ) : (
        <p className={styles.noAssets}>No assets uploaded.</p>
      )}
    </div>
  );
};