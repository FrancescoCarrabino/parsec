// src/hooks/useAssetManager.tsx
import { useCallback } from 'react';
import { useAppState } from '../state/AppStateContext';
// We no longer need these types here, as the hook's job is just to upload.
// import type { AssetItem, AssetType } from '../state/types';

export const useAssetManager = () => {
  // We no longer dispatch directly from here. The WebSocket will trigger the dispatch.
  // const { dispatch } = useAppState();

  const uploadAssets = useCallback(async (files: FileList | null) => {
    if (!files) return;

    for (const file of files) {
      // 1. Create a FormData object to send the file.
      // This is the standard way to send files via HTTP.
      const formData = new FormData();
      formData.append('file', file);

      try {
        // 2. Make the API call to your backend endpoint.
        const response = await fetch('http://localhost:8000/api/v1/assets/', {
          method: 'POST',
          body: formData,
          // Note: Do NOT set the 'Content-Type' header manually.
          // The browser will automatically set it to 'multipart/form-data'
          // with the correct boundary when you use FormData.
        });

        if (!response.ok) {
          // If the server responds with an error, log it.
          const errorData = await response.json();
          console.error('Asset upload failed:', errorData.detail || 'Unknown error');
          // Optional: Display a user-facing error toast/message here.
        }


      } catch (error) {
        console.error('An error occurred during file upload:', error);
        // Optional: Display a user-facing error for network failures.
      }
    }
  }, []); // The dispatch dependency is no longer needed.

  return { uploadAssets };
};