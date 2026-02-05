/**
 * Shared chunked upload hook with progress tracking
 * Used by DashboardPage, OrganizationVideosPage, OrganizationDetailPage
 */
import { useState, useCallback, useRef } from 'react';
import axiosInstance from '../api/axiosInstance';
import { API_ENDPOINTS } from '../config/api.config';

export interface UploadProgress {
  percent: number;
  currentChunk: number;
  totalChunks: number;
}

interface UseUploadOptions {
  categoryId?: number;
  organizationId?: number;
  onSuccess?: () => void;
  onError?: (message: string) => void;
}

export const useUpload = (options: UseUploadOptions = {}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const abortRef = useRef(false);

  const upload = useCallback(
    async (file: File) => {
      setIsUploading(true);
      setUploadError(null);
      setProgress(null);
      abortRef.current = false;

      const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      const uploadId = Date.now().toString() + '_' + file.name;

      try {
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
          if (abortRef.current) {
            setUploadError('Upload cancelled');
            break;
          }

          const start = chunkIndex * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const chunk = file.slice(start, end);

          const formData = new FormData();
          formData.append('chunk', chunk);
          formData.append('upload_id', uploadId);
          formData.append('chunk_index', chunkIndex.toString());
          formData.append('total_chunks', totalChunks.toString());
          formData.append('filename', file.name);

          if (options.organizationId) {
            formData.append('organization', options.organizationId.toString());
          }
          if (options.categoryId) {
            formData.append('category', options.categoryId.toString());
          }

          await axiosInstance.post(API_ENDPOINTS.VIDEOS.UPLOAD, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });

          setProgress({
            percent: Math.round(((chunkIndex + 1) / totalChunks) * 100),
            currentChunk: chunkIndex + 1,
            totalChunks,
          });
        }

        if (!abortRef.current) {
          await axiosInstance.post(API_ENDPOINTS.VIDEOS.COMPLETE, {
            upload_id: uploadId,
            filename: file.name,
            total_chunks: totalChunks,
            ...(options.organizationId ? { organization: options.organizationId } : {}),
            ...(options.categoryId ? { category: options.categoryId } : {}),
          });

          options.onSuccess?.();
        }
      } catch (error: any) {
        let errorMessage = 'Upload failed. Please try again.';
        if (error.response?.status === 429) {
          errorMessage = 'Too many requests. Please wait and try again.';
        } else if (error.response?.status === 413) {
          errorMessage = error.response.data?.error || 'File too large.';
        } else if (typeof error.response?.data?.error === 'string') {
          errorMessage = error.response.data.error;
        } else if (error.message) {
          errorMessage = error.message;
        }
        setUploadError(errorMessage);
        options.onError?.(errorMessage);
      } finally {
        setIsUploading(false);
      }
    },
    [options.categoryId, options.organizationId, options.onSuccess, options.onError],
  );

  const cancelUpload = useCallback(() => {
    abortRef.current = true;
  }, []);

  return { upload, isUploading, uploadError, progress, cancelUpload, setUploadError };
};
