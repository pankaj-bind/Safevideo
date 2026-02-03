/**
 * ChapterView - Video player page with playlist sidebar
 * Fourth level: Dashboard > Vault > Subject > Chapter > [Videos]
 * Supports both uploaded videos (Google Drive) and YouTube links
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { API_ENDPOINTS, API_CONFIG } from '../config/api.config';
import PageLayout from '../components/PageLayout';
import ResourceModal from '../components/ResourceModal';
import type { FieldConfig } from '../components/ResourceModal';
import type { Chapter, Video, VideoCreate, BreadcrumbItem } from '../types/api.types';
import { 
  Play, 
  Plus, 
  Trash2, 
  Pencil, 
  Upload,
  Youtube,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  List,
  X
} from 'lucide-react';

// ============================================================================
// VIDEO MODAL FIELD CONFIGURATION
// ============================================================================

const getVideoFields = (videoType: 'UPLOAD' | 'YOUTUBE'): FieldConfig[] => {
  const baseFields: FieldConfig[] = [
    {
      name: 'title',
      label: 'Video Title',
      type: 'text',
      required: true,
      placeholder: 'e.g., Introduction to Boolean Algebra',
    },
    {
      name: 'description',
      label: 'Description',
      type: 'textarea',
      placeholder: 'Brief description of this video...',
    },
  ];

  if (videoType === 'YOUTUBE') {
    baseFields.push({
      name: 'youtube_url',
      label: 'YouTube URL',
      type: 'url',
      required: true,
      placeholder: 'https://www.youtube.com/watch?v=...',
    });
  }

  return baseFields;
};

// ============================================================================
// YOUTUBE URL PARSER
// ============================================================================

const getYouTubeVideoId = (url: string): string | null => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
};

// ============================================================================
// VIDEO PLAYER COMPONENT
// ============================================================================

interface VideoPlayerProps {
  video: Video | null;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ video }) => {
  if (!video) {
    return (
      <div className="aspect-video bg-gray-900 rounded-xl flex items-center justify-center">
        <div className="text-center text-gray-400">
          <Play className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p>Select a video to play</p>
        </div>
      </div>
    );
  }

  if (video.video_type === 'YOUTUBE') {
    const videoId = getYouTubeVideoId(video.youtube_url);
    if (!videoId) {
      return (
        <div className="aspect-video bg-gray-900 rounded-xl flex items-center justify-center">
          <div className="text-center text-red-400">
            <AlertCircle className="w-16 h-16 mx-auto mb-4" />
            <p>Invalid YouTube URL</p>
          </div>
        </div>
      );
    }

    return (
      <div className="aspect-video bg-black rounded-xl overflow-hidden">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?rel=0`}
          title={video.title}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  // Uploaded video (Google Drive stream)
  if (video.status !== 'COMPLETED' || !video.file_id) {
    return (
      <div className="aspect-video bg-gray-900 rounded-xl flex items-center justify-center">
        <div className="text-center text-gray-400">
          {video.status === 'PROCESSING' ? (
            <>
              <Loader2 className="w-16 h-16 mx-auto mb-4 animate-spin" />
              <p>Video is processing...</p>
            </>
          ) : video.status === 'FAILED' ? (
            <>
              <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-400" />
              <p className="text-red-400">Video processing failed</p>
              {video.error_message && (
                <p className="text-sm mt-2 text-gray-500">{video.error_message}</p>
              )}
            </>
          ) : (
            <>
              <Clock className="w-16 h-16 mx-auto mb-4" />
              <p>Video is pending processing</p>
            </>
          )}
        </div>
      </div>
    );
  }

  const streamUrl = `${API_CONFIG.BASE_URL}${API_ENDPOINTS.VIDEOS.STREAM(video.file_id)}`;

  return (
    <div className="aspect-video bg-black rounded-xl overflow-hidden">
      <video
        key={video.id}
        src={streamUrl}
        controls
        className="w-full h-full"
        autoPlay
      >
        Your browser does not support the video tag.
      </video>
    </div>
  );
};

// ============================================================================
// PLAYLIST ITEM COMPONENT
// ============================================================================

interface PlaylistItemProps {
  video: Video;
  isActive: boolean;
  index: number;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const PlaylistItem: React.FC<PlaylistItemProps> = ({
  video,
  isActive,
  index,
  onClick,
  onEdit,
  onDelete,
}) => {
  const getStatusIcon = () => {
    switch (video.status) {
      case 'COMPLETED':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'PROCESSING':
        return <Loader2 className="w-4 h-4 text-yellow-500 animate-spin" />;
      case 'FAILED':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div
      className={`group p-3 rounded-lg cursor-pointer transition-all ${
        isActive
          ? 'bg-blue-50 border-2 border-blue-500'
          : 'bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm'
      }`}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {/* Index */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isActive ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'
        }`}>
          {video.video_type === 'YOUTUBE' ? (
            <Youtube className="w-4 h-4" />
          ) : (
            <span className="text-sm font-medium">{index + 1}</span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className={`font-medium truncate ${isActive ? 'text-blue-700' : 'text-gray-900'}`}>
            {video.title}
          </h4>
          <div className="flex items-center gap-2 mt-1">
            {getStatusIcon()}
            <span className="text-xs text-gray-500">
              {video.video_type === 'YOUTUBE' ? 'YouTube' : 'Uploaded'}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="p-1.5 rounded-lg hover:bg-gray-100"
            title="Edit"
          >
            <Pencil className="w-4 h-4 text-gray-500" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1.5 rounded-lg hover:bg-red-50"
            title="Delete"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// ADD VIDEO TYPE SELECTOR
// ============================================================================

interface AddVideoSelectorProps {
  onSelect: (type: 'UPLOAD' | 'YOUTUBE') => void;
  onClose: () => void;
}

const AddVideoSelector: React.FC<AddVideoSelectorProps> = ({ onSelect, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">Add Video</h3>
        <p className="text-gray-600 mb-6">Choose how you want to add a video:</p>
        
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => onSelect('UPLOAD')}
            className="p-6 rounded-xl border-2 border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all group"
          >
            <Upload className="w-8 h-8 mx-auto mb-3 text-gray-400 group-hover:text-blue-500" />
            <p className="font-medium text-gray-900 group-hover:text-blue-700">Upload File</p>
            <p className="text-xs text-gray-500 mt-1">Upload to Drive</p>
          </button>
          
          <button
            onClick={() => onSelect('YOUTUBE')}
            className="p-6 rounded-xl border-2 border-gray-200 hover:border-red-500 hover:bg-red-50 transition-all group"
          >
            <Youtube className="w-8 h-8 mx-auto mb-3 text-gray-400 group-hover:text-red-500" />
            <p className="font-medium text-gray-900 group-hover:text-red-700">YouTube Link</p>
            <p className="text-xs text-gray-500 mt-1">Paste a URL</p>
          </button>
        </div>
        
        <button
          onClick={onClose}
          className="w-full mt-4 px-4 py-2 text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// FILE UPLOAD MODAL
// ============================================================================

interface FileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File, title: string, description: string) => Promise<void>;
  isUploading: boolean;
}

const FileUploadModal: React.FC<FileUploadModalProps> = ({
  isOpen,
  onClose,
  onUpload,
  isUploading,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    
    await onUpload(file, title || file.name, description);
    setFile(null);
    setTitle('');
    setDescription('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      if (!title) {
        setTitle(selectedFile.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Upload Video</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* File Input */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`w-full p-8 rounded-xl border-2 border-dashed transition-all ${
                file ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
              }`}
            >
              {file ? (
                <div className="text-center">
                  <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-500" />
                  <p className="font-medium text-gray-900">{file.name}</p>
                  <p className="text-sm text-gray-500">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <Upload className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                  <p className="font-medium text-gray-700">Click to select a video file</p>
                  <p className="text-sm text-gray-500">MP4, WebM, MOV supported</p>
                </div>
              )}
            </button>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Video title"
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description..."
              rows={3}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!file || isUploading}
              className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isUploading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isUploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const ChapterView: React.FC = () => {
  const { chapterId } = useParams<{ chapterId: string }>();
  
  // State
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [activeVideo, setActiveVideo] = useState<Video | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Modal States
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showYoutubeModal, setShowYoutubeModal] = useState(false);
  const [editingVideo, setEditingVideo] = useState<Video | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  // Delete State
  const [deleteTarget, setDeleteTarget] = useState<Video | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Mobile playlist toggle
  const [showPlaylist, setShowPlaylist] = useState(false);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const fetchData = useCallback(async () => {
    if (!chapterId) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await axiosInstance.get(
        API_ENDPOINTS.CHAPTERS.DETAIL(parseInt(chapterId))
      );
      
      setChapter(response.data);
      setVideos(response.data.videos || []);
      
      // Auto-select first playable video
      const firstPlayable = response.data.videos?.find((v: Video) => v.is_playable);
      if (firstPlayable && !activeVideo) {
        setActiveVideo(firstPlayable);
      }
    } catch (err) {
      console.error('Failed to fetch chapter:', err);
      setError('Failed to load chapter. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [chapterId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleAddVideo = (type: 'UPLOAD' | 'YOUTUBE') => {
    setShowTypeSelector(false);
    if (type === 'UPLOAD') {
      setShowUploadModal(true);
    } else {
      setShowYoutubeModal(true);
    }
  };

  const handleFileUpload = async (file: File, title: string, description: string) => {
    if (!chapterId) return;
    
    try {
      setIsUploading(true);
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('chapter_id', chapterId);
      formData.append('title', title);
      formData.append('description', description);
      
      await axiosInstance.post(
        API_ENDPOINTS.VIDEOS.UPLOAD,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 600000, // 10 min for large uploads
        }
      );
      
      // Refresh videos list
      await fetchData();
      setShowUploadModal(false);
    } catch (err) {
      console.error('Upload failed:', err);
      setError('Failed to upload video. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleYoutubeSubmit = async (data: Record<string, string>) => {
    if (!chapterId) return;
    
    try {
      setIsSubmitting(true);
      
      const payload: VideoCreate = {
        chapter: parseInt(chapterId),
        title: data.title,
        description: data.description || '',
        video_type: 'YOUTUBE',
        youtube_url: data.youtube_url,
      };

      if (editingVideo) {
        await axiosInstance.patch(
          API_ENDPOINTS.VIDEOS.UPDATE(editingVideo.id),
          payload
        );
      } else {
        await axiosInstance.post(API_ENDPOINTS.VIDEOS.CREATE, payload);
      }

      await fetchData();
      setShowYoutubeModal(false);
      setEditingVideo(null);
    } catch (err) {
      console.error('Failed to save video:', err);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (video: Video) => {
    setEditingVideo(video);
    if (video.video_type === 'YOUTUBE') {
      setShowYoutubeModal(true);
    }
    // For uploaded videos, only allow title/description edit
  };

  const handleDelete = (video: Video) => {
    setDeleteTarget(video);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    
    try {
      setIsDeleting(true);
      await axiosInstance.delete(API_ENDPOINTS.VIDEOS.DELETE(deleteTarget.id));
      setVideos((prev) => prev.filter((v) => v.id !== deleteTarget.id));
      
      if (activeVideo?.id === deleteTarget.id) {
        setActiveVideo(null);
      }
      
      setDeleteTarget(null);
    } catch (err) {
      console.error('Failed to delete video:', err);
      setError('Failed to delete video. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  // ============================================================================
  // BREADCRUMB DATA
  // ============================================================================

  const breadcrumbData = chapter
    ? {
        vault: { id: chapter.vault_id!, title: chapter.vault_title! } as BreadcrumbItem,
        subject: { id: chapter.subject, title: chapter.subject_title! } as BreadcrumbItem,
        chapter: { id: chapter.id, title: chapter.title } as BreadcrumbItem,
      }
    : undefined;

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <PageLayout
      title={chapter?.title || 'Loading...'}
      breadcrumb={breadcrumbData}
      currentLevel="chapter"
      isLoading={isLoading && !chapter}
      actions={
        <button
          onClick={() => setShowPlaylist(!showPlaylist)}
          className="lg:hidden p-2.5 rounded-lg bg-gray-100 hover:bg-gray-200"
        >
          <List className="w-5 h-5" />
        </button>
      }
    >
      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-500 hover:text-red-700"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content - Player + Playlist */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Video Player */}
        <div className="lg:col-span-2">
          <VideoPlayer video={activeVideo} />
          
          {/* Video Info */}
          {activeVideo && (
            <div className="mt-4 p-4 bg-white rounded-xl border border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">{activeVideo.title}</h2>
              {activeVideo.description && (
                <p className="text-gray-600 mt-2">{activeVideo.description}</p>
              )}
            </div>
          )}
        </div>

        {/* Playlist Sidebar */}
        <div className={`
          fixed inset-y-0 right-0 w-80 bg-white border-l border-gray-200 z-50 transform transition-transform lg:static lg:transform-none lg:w-auto lg:border-0
          ${showPlaylist ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
        `}>
          {/* Mobile Header */}
          <div className="lg:hidden flex items-center justify-between p-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Playlist</h3>
            <button onClick={() => setShowPlaylist(false)} className="p-2 rounded-lg hover:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Playlist Content */}
          <div className="p-4 lg:p-0 space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 hidden lg:block">
                Playlist ({videos.length})
              </h3>
              <button
                onClick={() => setShowTypeSelector(true)}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Video
              </button>
            </div>

            {videos.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Play className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No videos yet</p>
                <p className="text-sm">Add your first video to get started</p>
              </div>
            ) : (
              videos.map((video, index) => (
                <PlaylistItem
                  key={video.id}
                  video={video}
                  isActive={activeVideo?.id === video.id}
                  index={index}
                  onClick={() => {
                    setActiveVideo(video);
                    setShowPlaylist(false);
                  }}
                  onEdit={() => handleEdit(video)}
                  onDelete={() => handleDelete(video)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Mobile Playlist Backdrop */}
      {showPlaylist && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setShowPlaylist(false)}
        />
      )}

      {/* Add Video Type Selector */}
      {showTypeSelector && (
        <AddVideoSelector
          onSelect={handleAddVideo}
          onClose={() => setShowTypeSelector(false)}
        />
      )}

      {/* File Upload Modal */}
      <FileUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUpload={handleFileUpload}
        isUploading={isUploading}
      />

      {/* YouTube Video Modal */}
      <ResourceModal
        isOpen={showYoutubeModal}
        onClose={() => {
          setShowYoutubeModal(false);
          setEditingVideo(null);
        }}
        onSubmit={handleYoutubeSubmit}
        title={editingVideo ? 'Edit YouTube Video' : 'Add YouTube Video'}
        fields={getVideoFields('YOUTUBE')}
        initialData={
          editingVideo
            ? {
                title: editingVideo.title,
                description: editingVideo.description,
                youtube_url: editingVideo.youtube_url,
              }
            : {}
        }
        submitLabel={editingVideo ? 'Save Changes' : 'Add Video'}
        isLoading={isSubmitting}
      />

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setDeleteTarget(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Delete Video?
            </h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete <strong>"{deleteTarget.title}"</strong>?
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
};

export default ChapterView;
