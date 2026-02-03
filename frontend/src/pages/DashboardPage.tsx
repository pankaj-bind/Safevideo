import React, { useState, useEffect, useRef, useCallback } from 'react';
import axiosInstance from '../api/axiosInstance';
import { useAuth } from '../context/AuthContext';
import { API_ENDPOINTS, API_CONFIG } from '../config/api.config';
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

interface StatsData {
  total: number;
  processing: number;
  completed: number;
  failed: number;
}

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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {statItems.map((item) => (
        <div
          key={item.label}
          className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">{item.label}</p>
              {isLoading ? (
                <div className="h-8 w-16 bg-gray-200 rounded animate-pulse mt-1" />
              ) : (
                <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
              )}
            </div>
            <div className={`p-3 rounded-xl ${item.bg}`}>
              <item.icon className={`w-6 h-6 ${item.color} ${item.label === 'Processing' && stats.processing > 0 ? 'animate-spin' : ''}`} />
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
    <div className="mb-8">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`
          relative overflow-hidden rounded-2xl border-2 border-dashed p-12
          transition-all duration-300 ease-out cursor-pointer
          ${isDragOver 
            ? 'border-blue-500 bg-blue-50 scale-[1.02]' 
            : 'border-gray-200 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/50'
          }
          ${isUploading ? 'pointer-events-none opacity-70' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          className="hidden"
          disabled={isUploading}
        />

        <div className="flex flex-col items-center justify-center text-center">
          {isUploading ? (
            <>
              <div className="relative mb-4">
                <div className="w-16 h-16 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
                <CloudUpload className="w-6 h-6 text-blue-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <p className="text-lg font-semibold text-gray-700">Uploading your video...</p>
              <p className="text-sm text-gray-500 mt-1">Please wait while we process your file</p>
            </>
          ) : (
            <>
              <div className={`p-4 rounded-2xl mb-4 transition-colors ${isDragOver ? 'bg-blue-100' : 'bg-white'}`}>
                <Upload className={`w-10 h-10 ${isDragOver ? 'text-blue-600' : 'text-gray-400'}`} />
              </div>
              <p className="text-lg font-semibold text-gray-700">
                {isDragOver ? 'Drop your video here!' : 'Drag & drop your video'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                or <span className="text-blue-600 font-medium hover:underline">browse files</span>
              </p>
              <p className="text-xs text-gray-400 mt-3">Supports MP4, MOV, AVI, and more</p>
            </>
          )}
        </div>
      </div>

      {uploadError && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-700">Upload Failed</p>
            <p className="text-sm text-red-600">{uploadError}</p>
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// VIDEO CARD COMPONENT
// =============================================================================
const VideoCard: React.FC<{ video: Video }> = ({ video }) => {
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

  const statusConfig = getStatusConfig(video.status);
  const StatusIcon = statusConfig.icon;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-lg transition-all duration-300 group">
      {/* Video Player / Preview Area */}
      <div className="aspect-video bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 relative">
        {video.status === 'COMPLETED' && video.file_id ? (
          <video
            controls
            preload="metadata"
            className="w-full h-full object-contain"
            poster={`data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 225'><rect fill='%231f2937' width='400' height='225'/><text x='200' y='112' text-anchor='middle' fill='%236b7280' font-size='14'>Loading...</text></svg>`}
          >
            <source
              src={`${API_CONFIG.BASE_URL}${API_ENDPOINTS.VIDEOS.STREAM(video.file_id)}`}
              type="video/mp4"
            />
            Your browser does not support the video tag.
          </video>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {video.status === 'PROCESSING' && (
              <>
                <div className="relative">
                  <div className="w-16 h-16 rounded-full border-4 border-blue-900/30 border-t-blue-500 animate-spin" />
                  <Play className="w-6 h-6 text-blue-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <p className="text-white/80 text-sm mt-4 font-medium">Processing your video...</p>
                <p className="text-white/50 text-xs mt-1">This may take a few minutes</p>
              </>
            )}
            {video.status === 'PENDING' && (
              <>
                <Clock className="w-12 h-12 text-gray-500" />
                <p className="text-gray-400 text-sm mt-3">Waiting in queue...</p>
              </>
            )}
            {video.status === 'FAILED' && (
              <>
                <AlertCircle className="w-12 h-12 text-red-400" />
                <p className="text-red-400 text-sm mt-3 font-medium">Processing Failed</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Card Content */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-semibold text-gray-900 truncate flex-1 text-lg" title={video.title}>
            {video.title}
          </h3>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${statusConfig.badge}`}
          >
            <StatusIcon className={`w-3.5 h-3.5 ${video.status === 'PROCESSING' ? 'animate-spin' : ''}`} />
            {statusConfig.label}
          </span>
        </div>

        <p className="text-sm text-gray-500">
          {formatDistanceToNow(new Date(video.created_at), { addSuffix: true })}
        </p>

        {video.status === 'FAILED' && video.error_message && (
          <div className="mt-3 p-3 bg-red-50 rounded-xl border border-red-100">
            <p className="text-xs text-red-600 line-clamp-2">{video.error_message}</p>
          </div>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// VIDEO GRID COMPONENT
// =============================================================================
const VideoGrid: React.FC<{ videos: Video[]; isLoading: boolean }> = ({ videos, isLoading }) => {
  if (isLoading && videos.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            <div className="aspect-video bg-gray-200 animate-pulse" />
            <div className="p-5">
              <div className="h-5 bg-gray-200 rounded animate-pulse w-3/4 mb-3" />
              <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
        <Film className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-700 mb-2">No videos yet</h3>
        <p className="text-gray-500">Upload your first video to get started!</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {videos.map((video) => (
        <VideoCard key={video.id} video={video} />
      ))}
    </div>
  );
};

// =============================================================================
// MAIN DASHBOARD PAGE
// =============================================================================
const DashboardPage: React.FC = () => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { logout } = useAuth();

  const stats: StatsData = {
    total: videos.length,
    processing: videos.filter((v) => v.status === 'PROCESSING').length,
    completed: videos.filter((v) => v.status === 'COMPLETED').length,
    failed: videos.filter((v) => v.status === 'FAILED').length,
  };

  const fetchVideos = useCallback(async () => {
    try {
      const response = await axiosInstance.get<Video[]>(API_ENDPOINTS.VIDEOS.LIST);
      setVideos(response.data);
    } catch (error) {
      console.error('Failed to fetch videos:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVideos();
    const intervalId = setInterval(fetchVideos, 5000);
    return () => clearInterval(intervalId);
  }, [fetchVideos]);

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
    } catch (error: any) {
      console.error('Upload failed:', error);
      setUploadError(error.response?.data?.error || 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
                <Film className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-bold text-gray-900">SafeVideo</h1>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={fetchVideos}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
              <button
                onClick={logout}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 rounded-xl transition-all"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
        <StatsOverview stats={stats} isLoading={isLoading} />

        {/* Upload Zone */}
        <UploadZone onUpload={handleUpload} isUploading={isUploading} uploadError={uploadError} />

        {/* Video Gallery */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Your Videos</h2>
          {videos.length > 0 && (
            <p className="text-sm text-gray-500">
              {videos.length} video{videos.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        <VideoGrid videos={videos} isLoading={isLoading} />
      </main>
    </div>
  );
};

export default DashboardPage;
