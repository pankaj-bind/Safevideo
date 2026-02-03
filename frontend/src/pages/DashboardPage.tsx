import React, { useState, useEffect, useRef, useCallback } from 'react';
import axiosInstance from '../api/axiosInstance';
import { useAuth } from '../context/AuthContext';
import { API_ENDPOINTS, API_CONFIG } from '../config/api.config';
import ErrorBoundary from '../components/ErrorBoundary';
import { 
  Upload, 
  Play, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Film, 
  Loader2, 
  CloudUpload,
  LogOut,
  RefreshCw,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon
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
    { label: 'Total Videos', value: stats.total, icon: Film, tone: 'info' },
    { label: 'Processing', value: stats.processing, icon: Loader2, tone: 'warning' },
    { label: 'Completed', value: stats.completed, icon: CheckCircle, tone: 'success' },
    { label: 'Failed', value: stats.failed, icon: AlertCircle, tone: 'danger' },
  ] as const;

  return (
    <div className="sv-stats">
      {statItems.map((item) => (
        <div
          key={item.label}
          className="sv-card sv-stat-card"
        >
          <div className="sv-stat">
            <div>
              <p className="sv-stat-label">{item.label}</p>
              {isLoading ? (
                <div className="sv-skeleton sv-skeleton--value" />
              ) : (
                <p className={`sv-stat-value sv-tone-${item.tone}`}>{item.value}</p>
              )}
            </div>
            <div className={`sv-stat-icon sv-tone-${item.tone}`}>
              <item.icon className={`${item.label === 'Processing' && stats.processing > 0 ? 'is-spinning' : ''}`} />
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
        className={`sv-upload ${isDragOver ? 'is-dragover' : ''} ${isUploading ? 'is-uploading' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          className="sv-hidden"
          disabled={isUploading}
        />

        <div className="sv-upload-inner">
          {isUploading ? (
            <>
              <div className="sv-upload-spinner">
                <div className="sv-spinner" />
                <CloudUpload className="sv-spinner-icon" />
              </div>
              <p className="sv-upload-title">Uploading your video...</p>
              <p className="sv-upload-subtitle">Please wait while we process your file</p>
            </>
          ) : (
            <>
              <div className={`sv-upload-icon ${isDragOver ? 'is-dragover' : ''}`}>
                <Upload />
              </div>
              <p className="sv-upload-title">
                {isDragOver ? 'Drop your video here!' : 'Drag & drop your video'}
              </p>
              <p className="sv-upload-subtitle">
                or <span className="sv-link">browse files</span>
              </p>
              <p className="sv-upload-meta">Supports MP4, MOV, AVI, and more</p>
            </>
          )}
        </div>
      </div>

      {uploadError && (
        <div className="sv-alert">
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
    <div className={`sv-video-card ${isDeleting ? 'is-deleting' : ''}`}>
      {/* Delete Button */}
      <button
        onClick={handleDelete}
        disabled={isDeleting}
        className="sv-video-delete"
        title="Delete video"
      >
        {isDeleting ? (
          <Loader2 className="is-spinning" />
        ) : (
          <Trash2 />
        )}
      </button>

      {/* Video Player / Preview Area */}
      <div className="sv-video-media">
        {video.status === 'COMPLETED' && video.file_id ? (
          <video
            controls
            preload="metadata"
            className="sv-video-player"
            poster={`data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 225'><rect fill='%231f2937' width='400' height='225'/><text x='200' y='112' text-anchor='middle' fill='%236b7280' font-size='14'>Loading...</text></svg>`}
          >
            <source
              src={`${API_CONFIG.BASE_URL}${API_ENDPOINTS.VIDEOS.STREAM(video.file_id)}`}
              type="video/mp4"
            />
            Your browser does not support the video tag.
          </video>
        ) : (
          <div className="sv-video-placeholder">
            {video.status === 'PROCESSING' && (
              <>
                <div className="sv-video-spinner">
                  <div className="sv-spinner" />
                  <Play className="sv-spinner-icon" />
                </div>
                <p className="sv-video-status">Processing your video...</p>
                <p className="sv-video-status-sub">This may take a few minutes</p>
              </>
            )}
            {video.status === 'PENDING' && (
              <>
                <Clock />
                <p className="sv-video-status">Waiting in queue...</p>
              </>
            )}
            {video.status === 'FAILED' && (
              <>
                <AlertCircle />
                <p className="sv-video-status is-failed">Processing Failed</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Card Content */}
      <div className="sv-video-body">
        <div className="sv-video-head">
          <h3 className="sv-video-title" title={video.title}>
            {video.title}
          </h3>
          <span
            className={`sv-badge sv-badge--${video.status.toLowerCase()}`}
          >
            <StatusIcon className={`${video.status === 'PROCESSING' ? 'is-spinning' : ''}`} />
            {statusConfig.label}
          </span>
        </div>

        <p className="sv-video-time">
          {formatDistanceToNow(new Date(video.created_at), { addSuffix: true })}
        </p>

        {video.status === 'FAILED' && video.error_message && (
          <div className="sv-video-error">
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
      <p className="sv-pagination-text">
        Showing <span className="font-semibold">{startItem}-{endItem}</span> of{' '}
        <span className="font-semibold">{totalItems}</span> videos
      </p>
      
      <div className="sv-pagination-controls">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="sv-page-btn"
        >
          <ChevronLeft />
          Previous
        </button>
        
        <div className="sv-page-list">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              className={`sv-page-number ${page === currentPage ? 'is-active' : ''}`}
            >
              {page}
            </button>
          ))}
        </div>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="sv-page-btn"
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
      <div className="sv-video-grid">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="sv-card sv-video-skeleton">
            <div className="sv-skeleton sv-skeleton--media" />
            <div className="sv-video-body">
              <div className="sv-skeleton sv-skeleton--title" />
              <div className="sv-skeleton sv-skeleton--text" />
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
      <div className="sv-video-grid">
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
  const [allVideos, setAllVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isTabVisible, setIsTabVisible] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (localStorage.getItem('theme') as 'light' | 'dark') || 'light'
  );
  const { logout } = useAuth();

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

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Reset to page 1 if current page becomes invalid
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handleUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    setIsUploading(true);
    setUploadError(null);

    try {
      await axiosInstance.post(API_ENDPOINTS.VIDEOS.UPLOAD, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
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

  return (
    <div className="sv-app">
      {/* Header */}
      <header className="sv-header">
        <div className="sv-header-inner">
          <div className="sv-brand">
            <div className="sv-logo">
              <Film />
            </div>
            <h1>SafeVideo</h1>
          </div>

          <div className="sv-actions">
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="sv-button sv-button--ghost"
              title="Toggle theme"
            >
              {theme === 'light' ? <Moon /> : <Sun />}
              {theme === 'light' ? 'Dark' : 'Light'}
            </button>
            <button
              onClick={fetchVideos}
              className="sv-button sv-button--ghost"
              title="Refresh"
            >
              <RefreshCw />
              Refresh
            </button>
            <button
              onClick={logout}
              className="sv-button sv-button--danger"
            >
              <LogOut />
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="sv-main">
        <section className="sv-hero">
          <div>
            <p className="sv-hero-kicker">Secure video processing</p>
            <h2>Upload once, access anywhere.</h2>
            <p className="sv-hero-sub">Fast uploads, clean previews, and real‑time processing status.</p>
          </div>
          <div className="sv-hero-card">
            <p>Privacy-first processing with cloud streaming.</p>
            <span>Designed like a premium workspace.</span>
          </div>
        </section>
        {/* Stats - Wrapped in Error Boundary */}
        <ErrorBoundary>
          <StatsOverview stats={stats} isLoading={isLoading} />
        </ErrorBoundary>

        {/* Upload Zone */}
        <UploadZone onUpload={handleUpload} isUploading={isUploading} uploadError={uploadError} />

        {/* Video Gallery Header */}
        <div className="sv-section sv-section--head">
          <h2>Your Videos</h2>
          {allVideos.length > 0 && (
            <p className="sv-muted">
              {allVideos.length} video{allVideos.length !== 1 ? 's' : ''} • Page {currentPage} of {totalPages || 1}
            </p>
          )}
        </div>

        {/* Video Grid - Wrapped in Error Boundary */}
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
