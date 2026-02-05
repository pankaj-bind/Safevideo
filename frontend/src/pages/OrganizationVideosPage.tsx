/**
 * OrganizationVideosPage Component
 * Shows all videos in a grid layout like YouTube homepage
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import axiosInstance from '../api/axiosInstance';
import { API_ENDPOINTS, API_CONFIG } from '../config/api.config';
import { 
  ArrowLeft,
  Upload,
  Play,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  CloudUpload,
  Trash2,
  X,
  RefreshCw
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

interface Organization {
  id: number;
  name: string;
  slug?: string;
  logo_url?: string | null;
  credential_count: number;
}

interface Category {
  id: number;
  name: string;
  slug?: string;
}

// =============================================================================
// UPLOAD MODAL COMPONENT
// =============================================================================
const UploadModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File) => void;
  isUploading: boolean;
  uploadError: string | null;
}> = ({ isOpen, onClose, onUpload, isUploading, uploadError }) => {
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('video/')) {
        onUpload(file);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      onUpload(e.target.files[0]);
    }
  };

  return (
    <div className="yt-modal-backdrop" onClick={onClose}>
      <div className="yt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="yt-modal-header">
          <h2>Upload Video</h2>
          <button onClick={onClose} className="yt-modal-close" disabled={isUploading}>
            <X size={20} />
          </button>
        </div>

        <div className="yt-modal-content">
          {uploadError && (
            <div className="yt-upload-error">
              <AlertCircle size={18} />
              {uploadError}
            </div>
          )}

          <div
            className={`yt-upload-zone ${dragActive ? 'yt-upload-zone--active' : ''} ${isUploading ? 'yt-upload-zone--disabled' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleChange}
              style={{ display: 'none' }}
              disabled={isUploading}
            />
            
            {isUploading ? (
              <div className="yt-upload-content">
                <Loader2 size={48} className="spin-animation" />
                <p className="yt-upload-text">Uploading your video...</p>
                <p className="yt-upload-hint">Please wait, this may take a while</p>
              </div>
            ) : (
              <div className="yt-upload-content">
                <CloudUpload size={48} />
                <p className="yt-upload-text">
                  {dragActive ? 'Drop your video here!' : 'Drag & drop your video'}
                </p>
                <p className="yt-upload-hint">or click to browse</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// VIDEO CARD COMPONENT
// =============================================================================
const VideoCard: React.FC<{
  video: Video;
  onDelete: (id: number) => void;
  onClick: () => void;
  categorySlug: string;
  organizationSlug: string;
}> = ({ video, onDelete, onClick, categorySlug, organizationSlug }) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();

  const getStatusConfig = (status: VideoStatus) => {
    switch (status) {
      case 'COMPLETED':
        return { icon: CheckCircle, text: 'Ready', color: 'text-green', bg: 'bg-green-light' };
      case 'PROCESSING':
        return { icon: Loader2, text: 'Processing', color: 'text-blue', bg: 'bg-blue-light' };
      case 'FAILED':
        return { icon: AlertCircle, text: 'Failed', color: 'text-red', bg: 'bg-red-light' };
      default:
        return { icon: Clock, text: 'Pending', color: 'text-yellow', bg: 'bg-yellow-light' };
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete "${video.title}"?`)) {
      setIsDeleting(true);
      onDelete(video.id);
    }
  };

  const handleCardClick = () => {
    if (video.status === 'COMPLETED' && video.file_id) {
      const videoSlug = video.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      navigate(`/${categorySlug}/${organizationSlug}/${videoSlug}`, { state: { videoId: video.id } });
    }
  };

  const statusConfig = getStatusConfig(video.status);
  const canPlay = video.status === 'COMPLETED' && video.file_id;

  return (
    <div 
      className={`video-card ${canPlay ? 'video-card--playable' : ''} ${isDeleting ? 'video-card--deleting' : ''}`}
      onClick={handleCardClick}
    >
      <div className="video-card-thumbnail">
        {canPlay ? (
          <>
            <div className="video-card-play-overlay">
              <Play size={48} />
            </div>
            <div className="video-card-duration">00:00</div>
          </>
        ) : (
          <div className="video-card-status-overlay">
            <statusConfig.icon size={32} className={statusConfig.color} />
          </div>
        )}
      </div>
      
      <div className="video-card-info">
        <h3 className="video-card-title">{video.title}</h3>
        <div className="video-card-meta">
          <span className={`video-card-badge ${statusConfig.bg}`}>
            <statusConfig.icon size={12} className={statusConfig.color} />
            {statusConfig.text}
          </span>
          <span className="video-card-date">
            {formatDistanceToNow(new Date(video.created_at), { addSuffix: true })}
          </span>
        </div>
        {video.error_message && (
          <p className="video-card-error">{video.error_message}</p>
        )}
      </div>

      <button
        className="video-card-delete"
        onClick={handleDelete}
        title="Delete video"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================
const OrganizationVideosPage: React.FC = () => {
  const { categorySlug, organizationSlug } = useParams<{ categorySlug: string; organizationSlug: string }>();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('sv-theme');
    return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  });

  const [organization, setOrganization] = useState<Organization>({ id: 0, name: '', credential_count: 0 });
  const [category, setCategory] = useState<Category>({ id: 0, name: '' });
  const [videos, setVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const handleThemeToggle = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sv-theme', theme);
  }, [theme]);

  useEffect(() => {
    fetchData();
  }, [categorySlug, organizationSlug]);

  useEffect(() => {
    const interval = setInterval(fetchVideos, 5000);
    return () => clearInterval(interval);
  }, [organization.id]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      // Fetch all organizations and categories to find by slug
      const [categoriesResponse, organizationsResponse] = await Promise.all([
        axiosInstance.get('/api/vault/categories/'),
        axiosInstance.get('/api/vault/organizations/')
      ]);

      const foundCategory = categoriesResponse.data.find(
        (cat: any) => (cat.slug || cat.name.toLowerCase().replace(/\s+/g, '-')) === categorySlug
      );
      
      const foundOrganization = organizationsResponse.data.find(
        (org: any) => (org.slug || org.name.toLowerCase().replace(/\s+/g, '-')) === organizationSlug
      );

      if (!foundCategory || !foundOrganization) {
        navigate('/home');
        return;
      }

      setCategory(foundCategory);
      setOrganization(foundOrganization);

      const videosResponse = await axiosInstance.get(`${API_ENDPOINTS.VIDEOS.LIST}?organization=${foundOrganization.id}`);
      setVideos(videosResponse.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      navigate('/home');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchVideos = async () => {
    if (!organization.id) return;
    try {
      const response = await axiosInstance.get(`${API_ENDPOINTS.VIDEOS.LIST}?organization=${organization.id}`);
      setVideos(response.data);
    } catch (error) {
      console.error('Failed to fetch videos:', error);
    }
  };

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);

    const CHUNK_SIZE = 5 * 1024 * 1024;
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
        formData.append('organization', organization.id.toString());
        formData.append('category', category.id.toString());

        await axiosInstance.post(API_ENDPOINTS.VIDEOS.UPLOAD, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      await axiosInstance.post(API_ENDPOINTS.VIDEOS.COMPLETE, {
        upload_id: uploadId,
        filename: file.name,
        total_chunks: totalChunks,
        organization: organization.id,
        category: category.id
      });

      setShowUploadModal(false);
      await fetchVideos();
    } catch (error: any) {
      console.error('Upload failed:', error);
      let errorMessage = 'Upload failed. Please try again.';
      
      if (error.response?.status === 429) {
        errorMessage = 'Too many requests. Please wait a moment and try again.';
      } else if (typeof error.response?.data?.error === 'string') {
        errorMessage = error.response.data.error;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setUploadError(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (videoId: number) => {
    try {
      await axiosInstance.delete(`${API_ENDPOINTS.VIDEOS.LIST}${videoId}/`);
      await fetchVideos();
    } catch (error) {
      console.error('Failed to delete video:', error);
    }
  };

  const handleSync = async () => {
    if (!organization.id) return;
    
    setIsSyncing(true);
    setSyncMessage(null);
    
    try {
      const response = await axiosInstance.post('/api/videos/sync/', {
        organization_id: organization.id
      });
      
      setSyncMessage(response.data.message);
      await fetchVideos();
      
      // Clear message after 5 seconds
      setTimeout(() => setSyncMessage(null), 5000);
    } catch (error: any) {
      console.error('Sync failed:', error);
      const errorMessage = error.response?.data?.error || 'Failed to sync with Google Drive';
      setSyncMessage(`Error: ${errorMessage}`);
      setTimeout(() => setSyncMessage(null), 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="yt-page">
        <Navbar theme={theme} onThemeToggle={handleThemeToggle} />
        <div className="org-videos-loading">
          <Loader2 size={48} className="spin-animation" />
          <p>Loading videos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="yt-page">
      <Navbar theme={theme} onThemeToggle={handleThemeToggle} />

      <main className="org-videos-main">
        {/* Header */}
        <div className="org-videos-header">
          <button onClick={() => navigate('/home')} className="org-back-btn">
            <ArrowLeft size={20} />
            Back to Home
          </button>
          
          <div className="org-info-header">
            {organization.logo_url && (
              <img src={organization.logo_url} alt="" className="org-logo-large" />
            )}
            <div>
              <p className="org-category-label">{category.name}</p>
              <h1 className="org-name-large">{organization.name}</h1>
              <p className="org-video-count">{videos.length} video{videos.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          <div className="org-header-actions">
            <button 
              className="org-sync-btn" 
              onClick={handleSync}
              disabled={isSyncing}
              title="Sync videos from Google Drive"
            >
              <RefreshCw size={20} className={isSyncing ? 'spin-animation' : ''} />
              {isSyncing ? 'Syncing...' : 'Sync from Drive'}
            </button>
            
            <button className="org-upload-btn" onClick={() => setShowUploadModal(true)}>
              <Upload size={20} />
              Upload Video
            </button>
          </div>
        </div>

        {/* Sync Message */}
        {syncMessage && (
          <div className={`org-sync-message ${syncMessage.startsWith('Error') ? 'error' : 'success'}`}>
            {syncMessage}
          </div>
        )}

        {/* Videos Grid */}
        {videos.length === 0 ? (
          <div className="org-videos-empty">
            <Play size={64} />
            <h2>No videos yet</h2>
            <p>Upload your first video to get started</p>
            <button className="org-upload-btn-large" onClick={() => setShowUploadModal(true)}>
              <Upload size={20} />
              Upload Video
            </button>
          </div>
        ) : (
          <div className="org-videos-grid">
            {videos.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                onDelete={handleDelete}
                onClick={() => {}}
                categorySlug={categorySlug!}
                organizationSlug={organizationSlug!}
              />
            ))}
          </div>
        )}
      </main>

      {/* Upload Modal */}
      <UploadModal
        isOpen={showUploadModal}
        onClose={() => !isUploading && setShowUploadModal(false)}
        onUpload={handleUpload}
        isUploading={isUploading}
        uploadError={uploadError}
      />
    </div>
  );
};

export default OrganizationVideosPage;
