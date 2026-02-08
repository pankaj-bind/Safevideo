import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { API_ENDPOINTS } from '../config/api.config';
import Navbar from '../components/Navbar';
import { useTheme } from '../hooks/useTheme';
import { useToast } from '../context/ToastContext';
import type { Video } from '../types/models';
import { ChevronLeft, ChevronRight, Play, RefreshCw, Trash2, Upload } from 'lucide-react';

// =============================================================================
// PAGINATION COMPONENT
// =============================================================================
const Pagination: React.FC<{
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}> = ({ currentPage, totalPages, totalItems, itemsPerPage, onPageChange }) => {
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  if (totalItems === 0) return null;

  return (
    <div className="sv-pagination">
      <p className="sv-muted">
        Showing <span className="sv-strong">{startItem}-{endItem}</span> of{' '}
        <span className="sv-strong">{totalItems}</span> videos
      </p>
      
      <div className="sv-pagination-controls">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="sv-action"
        >
          <ChevronLeft />
          Previous
        </button>
        
        <div className="sv-pagination-pages">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              className={`sv-action sv-page ${page === currentPage ? 'sv-page--active' : ''}`}
            >
              {page}
            </button>
          ))}
        </div>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="sv-action"
        >
          Next
          <ChevronRight />
        </button>
      </div>
    </div>
  );
};

const VIDEOS_PER_PAGE = 25;

const getCategoryLabel = (folderPath?: string | null) => {
  if (!folderPath) return '—';
  const first = folderPath.split('/')[0];
  return first || '—';
};

const formatUploadedAt = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
};

// =============================================================================
// MAIN DASHBOARD PAGE
// =============================================================================
const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { addToast } = useToast();
  const [allVideos, setAllVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isTabVisible, setIsTabVisible] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // (theme handled by useTheme hook)

  // Pagination calculations
  const totalPages = Math.ceil(allVideos.length / VIDEOS_PER_PAGE);
  const paginatedVideos = allVideos.slice(
    (currentPage - 1) * VIDEOS_PER_PAGE,
    currentPage * VIDEOS_PER_PAGE
  );

  const fetchVideos = useCallback(async () => {
    try {
      const response = await axiosInstance.get<Video[]>(API_ENDPOINTS.VIDEOS.LIST);
      setAllVideos(response.data);
    } catch (error) {
      console.error('Failed to fetch videos:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle tab visibility for pausing polling
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabVisible(!document.hidden);
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Polling with visibility check
  useEffect(() => {
    fetchVideos();
    
    const intervalId = setInterval(() => {
      if (isTabVisible) {
        fetchVideos();
      }
    }, 5000);
    
    return () => clearInterval(intervalId);
  }, [fetchVideos, isTabVisible]);

  // Reset to page 1 if current page becomes invalid
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);

    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const uploadId = Date.now().toString() + '_' + file.name;

    try {
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append('chunk', chunk);
        formData.append('upload_id', uploadId);
        formData.append('chunk_index', chunkIndex.toString());
        formData.append('total_chunks', totalChunks.toString());
        formData.append('filename', file.name);

        await axiosInstance.post(API_ENDPOINTS.VIDEOS.UPLOAD, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      // Finalize
      await axiosInstance.post(API_ENDPOINTS.VIDEOS.COMPLETE, {
        upload_id: uploadId,
        filename: file.name,
        total_chunks: totalChunks
      });

      await fetchVideos();
      setCurrentPage(1); // Go to first page to see new upload
    } catch (error: any) {
      console.error('Upload failed:', error);
      setUploadError(error.response?.data?.error || 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (videoId: number) => {
    // Optimistic update - remove immediately from UI
    setAllVideos((prev) => prev.filter((v) => v.id !== videoId));

    try {
      await axiosInstance.delete(API_ENDPOINTS.VIDEOS.DELETE(videoId));
    } catch (error: any) {
      console.error('Delete failed:', error);
      // Rollback on error - refetch to restore state
      await fetchVideos();
      addToast('Failed to delete video. Please try again.', 'error');
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpen = (video: Video) => {
    if (video.status !== 'COMPLETED' || !video.file_id) return;
    navigate(`/watch/${video.id}`);
  };

  return (
    <div className="sv-dashboard">
      <Navbar theme={theme} onThemeToggle={toggleTheme} />

      <main className="sv-shell sv-main">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>Videos</h1>
            <p style={{ margin: '6px 0 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
              Compact library view. Click a row to open.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="sv-action" onClick={fetchVideos} title="Refresh">
              <RefreshCw size={16} />
              Refresh
            </button>
            <button
              className="sv-action"
              onClick={() => !isUploading && fileInputRef.current?.click()}
              title="Upload"
            >
              <Upload size={16} />
              {isUploading ? 'Uploading…' : 'Upload'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              style={{ display: 'none' }}
              disabled={isUploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
            />
          </div>
        </div>

        {uploadError ? (
          <div style={{ marginBottom: 12, color: 'var(--danger)', fontSize: 13 }}>
            {uploadError}
          </div>
        ) : null}

        <div className="sv-table-wrap" aria-busy={isLoading}>
          <table className="sv-table">
            <thead>
              <tr>
                <th style={{ width: 88 }}>Thumbnail</th>
                <th>Title</th>
                <th style={{ width: 180 }}>Category</th>
                <th style={{ width: 120 }}>Duration</th>
                <th style={{ width: 220 }}>Uploaded At</th>
                <th style={{ width: 200 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedVideos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="sv-cell-muted" style={{ height: 60 }}>
                    {isLoading ? 'Loading…' : 'No videos found.'}
                  </td>
                </tr>
              ) : (
                paginatedVideos.map((v) => {
                  const canOpen = v.status === 'COMPLETED' && !!v.file_id;
                  return (
                    <tr
                      key={v.id}
                      onClick={() => canOpen && handleOpen(v)}
                      style={{ cursor: canOpen ? 'pointer' : 'default' }}
                    >
                      <td>
                        <span className="sv-thumb" title={canOpen ? 'Ready' : `Status: ${v.status}`}>
                          <Play size={14} />
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                            {v.title}
                          </span>
                          <span className="sv-cell-muted" style={{ fontSize: 12 }}>
                            {v.status}
                          </span>
                        </div>
                      </td>
                      <td className="sv-cell-muted">{getCategoryLabel(v.folder_path)}</td>
                      <td className="sv-cell-muted">
                        {v.duration != null && v.duration > 0
                          ? (() => {
                              const h = Math.floor(v.duration! / 3600);
                              const m = Math.floor((v.duration! % 3600) / 60);
                              const s = Math.floor(v.duration! % 60);
                              return h > 0
                                ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
                                : `${m}:${s.toString().padStart(2, '0')}`;
                            })()
                          : '—'}
                      </td>
                      <td className="sv-cell-muted" title={v.created_at}>
                        {formatUploadedAt(v.created_at)}
                      </td>
                      <td>
                        <div className="sv-actions-cell">
                          <button
                            className="sv-action"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpen(v);
                            }}
                            disabled={!canOpen}
                            title={canOpen ? 'Watch' : 'Not ready'}
                          >
                            Watch
                          </button>
                          <button
                            className="sv-action sv-action--danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`Delete "${v.title}"? This cannot be undone.`)) {
                                handleDelete(v.id);
                              }
                            }}
                            title="Delete"
                          >
                            <Trash2 size={16} />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={allVideos.length}
            itemsPerPage={VIDEOS_PER_PAGE}
            onPageChange={handlePageChange}
          />
        ) : null}
      </main>
    </div>
  );
};

export default DashboardPage;
