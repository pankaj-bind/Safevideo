import React, { useState, useEffect, useRef, useCallback } from 'react';
import axiosInstance from '../api/axiosInstance';
import { API_ENDPOINTS, API_CONFIG } from '../config/api.config';
import ErrorBoundary from '../components/ErrorBoundary';
import Navbar from '../components/Navbar';
import { 
  Upload, 
  Play, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Film, 
  Loader2, 
  CloudUpload,
  RefreshCw,
  Trash2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// =============================================================================
// TYPES
// =============================================================================
type VideoStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

interface Video {
  id: number;
  title: string;
  status: VideoStatus;
  error_message?: string | null;
  created_at: string;
  file_id?: string | null;
}

interface StatsData {
  total: number;
  processing: number;
  completed: number;
  failed: number;
}

const VIDEOS_PER_PAGE = 9;

// =============================================================================
// STATS OVERVIEW COMPONENT
// =============================================================================
const StatsOverview: React.FC<{ stats: StatsData; isLoading: boolean }> = ({ stats, isLoading }) => {
  const statItems = [
    { label: 'Total Videos', value: stats.total, icon: Film, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Processing', value: stats.processing, icon: Loader2, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { label: 'Completed', value: stats.completed, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Failed', value: stats.failed, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
  ];

  return (
    <div className="sv-stats">
      {statItems.map((item) => (
        <div
          key={item.label}
          className="sv-card sv-card--stat"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="sv-muted">{item.label}</p>
              {isLoading ? (
                <div className="sv-skeleton" />
              ) : (
                <p className="sv-stat-value">{item.value}</p>
              )}
            </div>
            <div className="sv-stat-icon">
              <item.icon className={item.label === 'Processing' && stats.processing > 0 ? 'sv-spin' : ''} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// =============================================================================
// UPLOAD ZONE COMPONENT
// =============================================================================
const UploadZone: React.FC<{
  onUpload: (file: File) => void;
  isUploading: boolean;
  uploadError: string | null;
}> = ({ onUpload, isUploading, uploadError }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('video/')) {
        onUpload(file);
      }
    },
    [onUpload]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="sv-section">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`sv-upload ${isDragOver ? 'sv-upload--active' : ''} ${isUploading ? 'sv-disabled' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          className="hidden"
          disabled={isUploading}
        />

        <div className="sv-upload-content">
          {isUploading ? (
            <>
              <div className="sv-upload-spinner">
                <div className="sv-spinner" />
                <CloudUpload className="sv-spinner-icon" />
              </div>
              <p className="sv-title">Uploading your video...</p>
              <p className="sv-muted">Please wait while we process your file</p>
            </>
          ) : (
            <>
              <div className="sv-upload-icon">
                <Upload />
              </div>
              <p className="sv-title">
                {isDragOver ? 'Drop your video here!' : 'Drag & drop your video'}
              </p>
              <p className="sv-muted">
                or <span className="sv-link">browse files</span>
              </p>
              <p className="sv-caption">Supports MP4, MOV, AVI, and more</p>
            </>
          )}
        </div>
      </div>

      {uploadError && (
        <div className="sv-alert sv-alert--error">
          <AlertCircle className="sv-alert-icon" />
          <div>
            <p className="sv-alert-title">Upload Failed</p>
            <p className="sv-alert-text">{uploadError}</p>
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// VIDEO CARD COMPONENT
// =============================================================================
const VideoCard: React.FC<{ video: Video; onDelete: (id: number) => void }> = ({ video, onDelete }) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const getStatusConfig = (status: VideoStatus) => {
    switch (status) {
      case 'COMPLETED':
        return {
          badge: 'bg-green-100 text-green-700 border-green-200',
          icon: CheckCircle,
          label: 'Completed',
        };
      case 'PROCESSING':
        return {
          badge: 'bg-yellow-100 text-yellow-700 border-yellow-200',
          icon: Loader2,
          label: 'Processing',
        };
      case 'FAILED':
        return {
          badge: 'bg-red-100 text-red-700 border-red-200',
          icon: AlertCircle,
          label: 'Failed',
        };
      default:
        return {
          badge: 'bg-gray-100 text-gray-700 border-gray-200',
          icon: Clock,
          label: 'Pending',
        };
    }
  };

  const handleDelete = async () => {
    if (window.confirm(`Are you sure you want to delete "${video.title}"? This action cannot be undone.`)) {
      setIsDeleting(true);
      onDelete(video.id);
    }
  };

  const statusConfig = getStatusConfig(video.status);
  const StatusIcon = statusConfig.icon;

  return (
    <div className={`sv-card sv-card--video ${isDeleting ? 'sv-disabled' : ''}`}>
      {/* Delete Button */}
      <button
        onClick={handleDelete}
        disabled={isDeleting}
        className="sv-delete"
        title="Delete video"
      >
        {isDeleting ? (
          <Loader2 className="sv-spin" />
        ) : (
          <Trash2 />
        )}
      </button>

      {/* Video Player / Preview Area */}
      <div className="sv-video-shell">
        {video.status === 'COMPLETED' && video.file_id ? (
          <video
            controls
            preload="metadata"
            className="sv-video"
            poster={`data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 225'><rect fill='%231f2937' width='400' height='225'/><text x='200' y='112' text-anchor='middle' fill='%236b7280' font-size='14'>Loading...</text></svg>`}
          >
            <source
              src={`${API_CONFIG.BASE_URL}${API_ENDPOINTS.VIDEOS.STREAM(video.file_id)}`}
              type="video/mp4"
            />
            Your browser does not support the video tag.
          </video>
        ) : (
          <div className="sv-video-status">
            {video.status === 'PROCESSING' && (
              <>
                <div className="sv-processing">
                  <div className="sv-processing-ring" />
                  <Play className="sv-processing-icon" />
                </div>
                <p className="sv-video-title">Processing your video...</p>
                <p className="sv-video-caption">This may take a few minutes</p>
              </>
            )}
            {video.status === 'PENDING' && (
              <>
                <Clock className="sv-muted" />
                <p className="sv-video-caption">Waiting in queue...</p>
              </>
            )}
            {video.status === 'FAILED' && (
              <>
                <AlertCircle className="sv-error" />
                <p className="sv-video-error">Processing Failed</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Card Content */}
      <div className="sv-card-body">
        <div className="sv-card-header">
          <h3 className="sv-card-title" title={video.title}>
            {video.title}
          </h3>
          <span className={`sv-badge sv-badge--${video.status.toLowerCase()}`}>
            <StatusIcon className={video.status === 'PROCESSING' ? 'sv-spin' : ''} />
            {statusConfig.label}
          </span>
        </div>

        <p className="sv-muted">
          {formatDistanceToNow(new Date(video.created_at), { addSuffix: true })}
        </p>

        {video.status === 'FAILED' && video.error_message && (
          <div className="sv-error-card">
            <p>{video.error_message}</p>
          </div>
        )}
      </div>
    </div>
  );
};

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
          className="sv-button sv-button--ghost"
        >
          <ChevronLeft />
          Previous
        </button>
        
        <div className="sv-pagination-pages">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              className={`sv-page ${page === currentPage ? 'sv-page--active' : ''}`}
            >
              {page}
            </button>
          ))}
        </div>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="sv-button sv-button--ghost"
        >
          Next
          <ChevronRight />
        </button>
      </div>
    </div>
  );
};

// =============================================================================
// VIDEO GRID COMPONENT
// =============================================================================
const VideoGrid: React.FC<{ 
  videos: Video[]; 
  isLoading: boolean; 
  onDelete: (id: number) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}> = ({ videos, isLoading, onDelete, currentPage, totalPages, onPageChange }) => {
  if (isLoading && videos.length === 0) {
    return (
      <div className="sv-grid">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="sv-card sv-card--video">
            <div className="sv-skeleton-video" />
            <div className="sv-card-body">
              <div className="sv-skeleton-line" />
              <div className="sv-skeleton-line sv-skeleton-line--short" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="sv-empty">
        <Film />
        <h3>No videos yet</h3>
        <p>Upload your first video to get started!</p>
      </div>
    );
  }

  return (
    <>
      <div className="sv-grid">
        {videos.map((video) => (
          <VideoCard key={video.id} video={video} onDelete={onDelete} />
        ))}
      </div>
      
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={videos.length * totalPages} // Approximate, will be corrected by parent
          itemsPerPage={VIDEOS_PER_PAGE}
          onPageChange={onPageChange}
        />
      )}
    </>
  );
};

// =============================================================================
// MAIN DASHBOARD PAGE
// =============================================================================
const DashboardPage: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('sv-theme');
    return stored === 'dark' ? 'dark' : 'light';
  });
  const [allVideos, setAllVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isTabVisible, setIsTabVisible] = useState(true);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sv-theme', theme);
  }, [theme]);

  // Pagination calculations
  const totalPages = Math.ceil(allVideos.length / VIDEOS_PER_PAGE);
  const paginatedVideos = allVideos.slice(
    (currentPage - 1) * VIDEOS_PER_PAGE,
    currentPage * VIDEOS_PER_PAGE
  );

  // Stats from all videos (not paginated)
  const stats: StatsData = {
    total: allVideos.length,
    processing: allVideos.filter((v) => v.status === 'PROCESSING').length,
    completed: allVideos.filter((v) => v.status === 'COMPLETED').length,
    failed: allVideos.filter((v) => v.status === 'FAILED').length,
  };

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
      alert('Failed to delete video. Please try again.');
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleThemeToggle = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="sv-dashboard">
      <Navbar theme={theme} onThemeToggle={handleThemeToggle} />

      <main className="sv-shell sv-main">
        <div className="sv-hero">
          <div>
            <h1>Upload once. Stream everywhere.</h1>
            <p>Lightning-fast processing, instant previews, and polished status cards.</p>
          </div>
          <div className="sv-hero-card">
            <p className="sv-muted">Storage</p>
            <p className="sv-hero-value">Google Drive</p>
            <p className="sv-hero-caption">Optimized resumable uploads</p>
          </div>
        </div>

        <div className="sv-refresh-bar">
          <button onClick={fetchVideos} className="sv-button sv-button--ghost" title="Refresh videos">
            <RefreshCw size={18} />
            Refresh
          </button>
        </div>

        <ErrorBoundary>
          <StatsOverview stats={stats} isLoading={isLoading} />
        </ErrorBoundary>

        <UploadZone onUpload={handleUpload} isUploading={isUploading} uploadError={uploadError} />

        <div className="sv-section-header">
          <div>
            <h2>Your Videos</h2>
            <p className="sv-muted">Manage uploads and review processing status.</p>
          </div>
          {allVideos.length > 0 && (
            <p className="sv-muted">
              {allVideos.length} video{allVideos.length !== 1 ? 's' : ''} • Page {currentPage} of {totalPages || 1}
            </p>
          )}
        </div>

        <ErrorBoundary>
          <VideoGrid 
            videos={paginatedVideos} 
            isLoading={isLoading} 
            onDelete={handleDelete}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
          
          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={allVideos.length}
              itemsPerPage={VIDEOS_PER_PAGE}
              onPageChange={handlePageChange}
            />
          )}
        </ErrorBoundary>
      </main>
    </div>
  );
};

export default DashboardPage;
