/**
 * OrganizationVideosPage Component
 * Shows all videos in a grid layout like YouTube homepage
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useTheme } from '../hooks/useTheme';
import { slugify } from '../utils/slugify';
import axiosInstance from '../api/axiosInstance';
import { API_ENDPOINTS } from '../config/api.config';
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
  RefreshCw,
  Send,
  Search,
  Download,
  FileText,
  Image,
  Archive,
  File,
  XCircle,
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
  progress?: number;
  error_message?: string | null;
  created_at: string;
  file_id?: string | null;
  duration?: number | null;
  thumbnail_url?: string | null;
  preview_url?: string | null;
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
  uploadProgress: number;
  uploadPhase: string;
}> = ({ isOpen, onClose, onUpload, isUploading, uploadError, uploadProgress, uploadPhase }) => {
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
                <div className="upload-progress-ring">
                  <svg viewBox="0 0 100 100" width="80" height="80">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border-color)" strokeWidth="6" />
                    <circle
                      cx="50" cy="50" r="42" fill="none"
                      stroke="var(--primary-color)" strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 42}`}
                      strokeDashoffset={`${2 * Math.PI * 42 * (1 - uploadProgress / 100)}`}
                      transform="rotate(-90 50 50)"
                      style={{ transition: 'stroke-dashoffset 0.3s ease' }}
                    />
                  </svg>
                  <span className="upload-progress-pct">{Math.round(uploadProgress)}%</span>
                </div>
                <p className="yt-upload-text">{uploadPhase}</p>
                <div className="upload-progress-bar-wrapper">
                  <div className="upload-progress-bar">
                    <div className="upload-progress-fill" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
                <p className="yt-upload-hint">Please don't close this window</p>
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
// TELEGRAM UPLOAD MODAL COMPONENT
// =============================================================================
interface TelegramMediaItem {
  msg_id: number;
  name: string;
  raw_name: string;
  size_mb: number;
  size_bytes: number;
  mime_type: string;
  type: string;
  date: string | null;
}

const getFileIcon = (type: string) => {
  switch (type) {
    case 'video': return Play;
    case 'pdf': return FileText;
    case 'image': return Image;
    case 'archive': return Archive;
    default: return File;
  }
};

const TelegramUploadModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  organizationId: number;
  categoryId: number;
  onDownloadStarted: () => void;
}> = ({ isOpen, onClose, organizationId, categoryId, onDownloadStarted }) => {
  const [step, setStep] = useState<'group' | 'browse' | 'progress'>('group');
  const [groupId, setGroupId] = useState('');
  const [mediaList, setMediaList] = useState<TelegramMediaItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Progress tracking
  const [videoIds, setVideoIds] = useState<number[]>([]);
  const [progressData, setProgressData] = useState<Record<number, { progress: number; status: string; title: string }>>({});
  const [speedData, setSpeedData] = useState<Record<number, number>>({});
  const [cancelling, setCancelling] = useState<Set<number>>(new Set());

  // Poll progress + speed
  React.useEffect(() => {
    if (step !== 'progress' || videoIds.length === 0) return;
    const interval = setInterval(async () => {
      try {
        const [videosRes, statusRes] = await Promise.all([
          axiosInstance.get(`${API_ENDPOINTS.VIDEOS.LIST}?organization=${organizationId}`),
          axiosInstance.post(API_ENDPOINTS.TELEGRAM.STATUS, { video_ids: videoIds }),
        ]);
        const map: Record<number, { progress: number; status: string; title: string }> = {};
        for (const v of videosRes.data) {
          if (videoIds.includes(v.id)) {
            map[v.id] = { progress: v.progress, status: v.status, title: v.title };
          }
        }
        setProgressData(map);
        setSpeedData(statusRes.data.speeds || {});

        // Stop polling when all done
        const allDone = videoIds.every(
          (id) => map[id] && ['COMPLETED', 'FAILED', 'CANCELED'].includes(map[id].status)
        );
        if (allDone) clearInterval(interval);
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [step, videoIds, organizationId]);

  if (!isOpen) return null;

  const handleFetch = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axiosInstance.get(
        `${API_ENDPOINTS.TELEGRAM.GROUP_MEDIA}?group_id=${encodeURIComponent(groupId)}`,
        { timeout: 120_000 }   // 2 min – get_dialogs + scan can be slow
      );
      setMediaList(res.data.media || []);
      setSelected(new Set());
      setStep('browse');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch media.');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (msgId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(msgId) ? next.delete(msgId) : next.add(msgId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filteredMedia.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredMedia.map((m) => m.msg_id)));
    }
  };

  const handleDownload = async () => {
    setError(null);
    setLoading(true);

    // Build media_info map for the backend
    const mediaInfo: Record<string, { name: string; size_bytes: number; mime_type: string }> = {};
    for (const item of mediaList) {
      if (selected.has(item.msg_id)) {
        mediaInfo[String(item.msg_id)] = {
          name: item.name,
          size_bytes: item.size_bytes,
          mime_type: item.mime_type,
        };
      }
    }

    try {
      const res = await axiosInstance.post(API_ENDPOINTS.TELEGRAM.DOWNLOAD, {
        group_id: groupId,
        message_ids: Array.from(selected),
        organization_id: organizationId,
        category_id: categoryId,
        media_info: mediaInfo,
      });
      setVideoIds(res.data.video_ids || []);
      setStep('progress');
      onDownloadStarted();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Download failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOne = async (vid: number) => {
    setCancelling((prev) => new Set(prev).add(vid));
    try {
      await axiosInstance.post(API_ENDPOINTS.TELEGRAM.CANCEL, { video_ids: [vid] });
    } catch { /* ignore */ }
  };

  const handleCancelAll = async () => {
    const active = videoIds.filter(
      (id) => !['COMPLETED', 'FAILED', 'CANCELED'].includes(progressData[id]?.status || '')
    );
    if (active.length === 0) return;
    setCancelling(new Set(active));
    try {
      await axiosInstance.post(API_ENDPOINTS.TELEGRAM.CANCEL, { video_ids: active });
    } catch { /* ignore */ }
  };

  const filteredMedia = mediaList.filter(
    (m) => m.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Overall progress for progress step
  const activeIds = videoIds.filter(
    (id) => !['CANCELED'].includes(progressData[id]?.status || '')
  );
  const overallPct =
    activeIds.length > 0
      ? Math.round(
          activeIds.reduce((sum, id) => sum + (progressData[id]?.progress || 0), 0) / activeIds.length
        )
      : 0;
  const doneCount = videoIds.filter((id) => progressData[id]?.status === 'COMPLETED').length;
  const failedCount = videoIds.filter((id) => progressData[id]?.status === 'FAILED').length;
  const cancelledCount = videoIds.filter((id) => progressData[id]?.status === 'CANCELED').length;
  const allFinished = videoIds.length > 0 && (doneCount + failedCount + cancelledCount) === videoIds.length;

  return (
    <div className="yt-modal-backdrop" onClick={() => { if (!loading && step !== 'progress') onClose(); }}>
      <div className="yt-modal tg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="yt-modal-header">
          <h2>
            {step === 'group' && 'Upload from Telegram'}
            {step === 'browse' && `Select Files (${mediaList.length} found)`}
            {step === 'progress' && 'Downloading & Processing'}
          </h2>
          <button
            onClick={onClose}
            className="yt-modal-close"
            disabled={loading || (step === 'progress' && !allFinished)}
          >
            <X size={20} />
          </button>
        </div>

        <div className="yt-modal-content tg-modal-content">
          {error && (
            <div className="yt-upload-error">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          {/* ─── Step 1: Enter Group ID ─── */}
          {step === 'group' && (
            <div className="tg-step">
              <p className="tg-step-desc">
                Enter the Telegram group/channel ID to browse its files.
              </p>
              <input
                className="profile-input"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                placeholder="e.g. -1002040588991"
              />
              <button
                className="btn btn--primary tg-step-btn"
                onClick={handleFetch}
                disabled={!groupId || loading}
              >
                {loading ? (
                  <Loader2 size={16} className="spin-animation" />
                ) : (
                  <Search size={16} />
                )}
                {loading ? 'Scanning…' : 'Fetch Media'}
              </button>
            </div>
          )}

          {/* ─── Step 2: Browse & Select ─── */}
          {step === 'browse' && (
            <div className="tg-browse">
              <div className="tg-browse-toolbar">
                <div className="tg-search-box">
                  <Search size={16} />
                  <input
                    placeholder="Search files…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <label className="tg-select-all">
                  <input
                    type="checkbox"
                    checked={selected.size === filteredMedia.length && filteredMedia.length > 0}
                    onChange={toggleAll}
                  />
                  Select All
                </label>
              </div>

              <div className="tg-file-list">
                {filteredMedia.map((item) => {
                  const Icon = getFileIcon(item.type);
                  return (
                    <label key={item.msg_id} className="tg-file-row">
                      <input
                        type="checkbox"
                        checked={selected.has(item.msg_id)}
                        onChange={() => toggleSelect(item.msg_id)}
                      />
                      <Icon size={18} className="tg-file-icon" />
                      <span className="tg-file-name" title={item.name}>
                        {item.name}
                      </span>
                      <span className="tg-file-size">{item.size_mb} MB</span>
                      <span className="tg-file-date">
                        {item.date ? new Date(item.date).toLocaleDateString() : ''}
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="tg-browse-footer">
                <button className="btn btn--ghost" onClick={() => setStep('group')}>
                  Back
                </button>
                <button
                  className="btn btn--primary"
                  onClick={handleDownload}
                  disabled={selected.size === 0 || loading}
                >
                  {loading ? (
                    <Loader2 size={16} className="spin-animation" />
                  ) : (
                    <Download size={16} />
                  )}
                  {loading ? 'Starting…' : `Download ${selected.size} file${selected.size !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          )}

          {/* ─── Step 3: Progress Tracking ─── */}
          {step === 'progress' && (
            <div className="tg-progress">
              {/* Overall ring */}
              <div className="tg-overall-progress">
                <svg viewBox="0 0 100 100" width="90" height="90">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border-color)" strokeWidth="6" />
                  <circle
                    cx="50" cy="50" r="42" fill="none"
                    stroke="var(--primary-color)" strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 42}`}
                    strokeDashoffset={`${2 * Math.PI * 42 * (1 - overallPct / 100)}`}
                    transform="rotate(-90 50 50)"
                    style={{ transition: 'stroke-dashoffset 0.4s ease' }}
                  />
                </svg>
                <span className="tg-overall-pct">{overallPct}%</span>
              </div>

              <div className="tg-overall-stats">
                <span className="tg-stat tg-stat--done">{doneCount} done</span>
                {failedCount > 0 && (
                  <span className="tg-stat tg-stat--failed">{failedCount} failed</span>
                )}
                {cancelledCount > 0 && (
                  <span className="tg-stat tg-stat--cancelled">{cancelledCount} cancelled</span>
                )}
                <span className="tg-stat">{videoIds.length} total</span>
              </div>

              {/* Cancel All button */}
              {!allFinished && (
                <button className="btn btn--danger tg-cancel-all-btn" onClick={handleCancelAll}>
                  <XCircle size={16} />
                  Cancel All
                </button>
              )}

              {/* Per-file items */}
              <div className="tg-progress-list">
                {videoIds.map((vid) => {
                  const d = progressData[vid];
                  const pct = d?.progress || 0;
                  const st = d?.status || 'PENDING';
                  const title = d?.title || `File #${vid}`;
                  const speed = speedData[vid] || 0;
                  const isActive = !['COMPLETED', 'FAILED', 'CANCELED'].includes(st);
                  const isCancelling = cancelling.has(vid);

                  let phaseLabel = 'Queued';
                  let phaseColor = 'var(--text-secondary)';
                  if (st === 'COMPLETED') { phaseLabel = 'Completed'; phaseColor = '#22c55e'; }
                  else if (st === 'FAILED') { phaseLabel = 'Failed'; phaseColor = '#ef4444'; }
                  else if (st === 'CANCELED') { phaseLabel = 'Cancelled'; phaseColor = '#f59e0b'; }
                  else if (isCancelling) { phaseLabel = 'Cancelling…'; phaseColor = '#f59e0b'; }
                  else if (pct >= 40) { phaseLabel = 'Processing & Uploading'; phaseColor = '#f59e0b'; }
                  else if (pct >= 5) { phaseLabel = `Downloading${speed > 0 ? ` · ${speed} MB/s` : ''}`; phaseColor = 'var(--primary-color)'; }
                  else if (pct >= 2) { phaseLabel = 'Starting'; phaseColor = 'var(--primary-color)'; }

                  const StatusIcon =
                    st === 'COMPLETED' ? CheckCircle :
                    st === 'FAILED' ? AlertCircle :
                    st === 'CANCELED' ? XCircle :
                    pct > 0 ? Loader2 : Clock;

                  return (
                    <div
                      key={vid}
                      className={`tg-progress-item ${st === 'COMPLETED' ? 'tg-progress-item--done' : ''} ${st === 'FAILED' ? 'tg-progress-item--failed' : ''} ${st === 'CANCELED' ? 'tg-progress-item--cancelled' : ''}`}
                    >
                      <StatusIcon
                        size={18}
                        className={`tg-progress-item-icon ${pct > 0 && isActive && !isCancelling ? 'spin-animation' : ''}`}
                        style={{ color: phaseColor }}
                      />
                      <div className="tg-progress-item-details">
                        <div className="tg-progress-item-header">
                          <span className="tg-progress-item-name" title={title}>{title}</span>
                          <span className="tg-progress-item-pct">{st === 'CANCELED' ? '—' : `${pct}%`}</span>
                        </div>
                        <div className="tg-progress-item-bar">
                          <div
                            className="tg-progress-item-fill"
                            style={{ width: `${st === 'CANCELED' ? 0 : pct}%`, background: phaseColor, transition: 'width 0.4s ease' }}
                          />
                        </div>
                        <div className="tg-progress-item-footer">
                          <span className="tg-progress-phase" style={{ color: phaseColor }}>
                            {phaseLabel}
                          </span>
                          {isActive && !isCancelling && (
                            <button
                              className="tg-cancel-btn"
                              onClick={() => handleCancelOne(vid)}
                              title="Cancel this download"
                            >
                              <XCircle size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {allFinished && (
                <button className="btn btn--primary tg-step-btn" onClick={onClose}>
                  Done
                </button>
              )}
            </div>
          )}
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
  categorySlug: string;
  organizationSlug: string;
  chapterSlug: string;
}> = ({ video, onDelete, categorySlug, organizationSlug, chapterSlug }) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const previewRef = React.useRef<HTMLVideoElement>(null);
  const hoverTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const formatDuration = (seconds: number | null | undefined): string => {
    if (!seconds || seconds <= 0) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleMouseEnter = () => {
    if (!video.preview_url || video.status !== 'COMPLETED') return;
    hoverTimerRef.current = setTimeout(() => {
      setIsHovering(true);
      // Small delay before playing to allow DOM update
      setTimeout(() => {
        if (previewRef.current) {
          previewRef.current.currentTime = 0;
          previewRef.current.play().catch(() => {});
        }
      }, 50);
    }, 500); // 500ms delay before showing preview
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setIsHovering(false);
    if (previewRef.current) {
      previewRef.current.pause();
      previewRef.current.currentTime = 0;
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
      const videoSlug = slugify(video.title);
      navigate(`/${categorySlug}/${organizationSlug}/${chapterSlug}/${videoSlug}`, { state: { videoId: video.id } });
    }
  };

  const statusConfig = getStatusConfig(video.status);
  const canPlay = video.status === 'COMPLETED' && video.file_id;

  return (
    <div 
      className={`video-card ${canPlay ? 'video-card--playable' : ''} ${isDeleting ? 'video-card--deleting' : ''}`}
      onClick={handleCardClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="video-card-thumbnail">
        {/* Thumbnail image */}
        {video.thumbnail_url && (
          <img
            src={video.thumbnail_url}
            alt={video.title}
            className={`video-card-thumb-img ${isHovering ? 'video-card-thumb-img--hidden' : ''}`}
          />
        )}

        {/* Preview video on hover */}
        {video.preview_url && isHovering && (
          <video
            ref={previewRef}
            src={video.preview_url}
            className="video-card-preview-video"
            muted
            loop
            playsInline
            crossOrigin="use-credentials"
          />
        )}

        {canPlay ? (
          <>
            {!isHovering && (
              <div className="video-card-play-overlay">
                <Play size={48} />
              </div>
            )}
            <div className="video-card-duration">
              {video.duration != null && video.duration > 0 ? formatDuration(video.duration) : '--:--'}
            </div>
          </>
        ) : (
          <div className="video-card-status-overlay">
            <statusConfig.icon size={32} className={`${statusConfig.color}${video.status === 'PROCESSING' ? ' spin-animation' : ''}`} />
            {(video.status === 'PROCESSING' || video.status === 'PENDING') && typeof video.progress === 'number' && video.progress > 0 && (
              <span className="video-card-progress-label">{video.progress}%</span>
            )}
          </div>
        )}
        {/* Progress bar at bottom of thumbnail */}
        {(video.status === 'PROCESSING' || video.status === 'PENDING') && typeof video.progress === 'number' && video.progress > 0 && (
          <div className="video-card-progress">
            <div className="video-card-progress-fill" style={{ width: `${video.progress}%` }} />
          </div>
        )}
      </div>
      
      <div className="video-card-info">
        <h3 className="video-card-title">{video.title}</h3>
        <div className="video-card-meta">
          <span className={`video-card-badge ${statusConfig.bg}`}>
            <statusConfig.icon size={12} className={statusConfig.color} />
            {statusConfig.text}{(video.status === 'PROCESSING' || video.status === 'PENDING') && typeof video.progress === 'number' && video.progress > 0 ? ` ${video.progress}%` : ''}
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
  const { categorySlug, organizationSlug, chapterSlug } = useParams<{ categorySlug: string; organizationSlug: string; chapterSlug: string }>();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const [organization, setOrganization] = useState<Organization>({ id: 0, name: '', credential_count: 0 });
  const [category, setCategory] = useState<Category>({ id: 0, name: '' });
  const [chapter, setChapter] = useState<{ id: number; name: string }>({ id: 0, name: '' });
  const [videos, setVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState('Preparing upload…');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showTelegramModal, setShowTelegramModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [categorySlug, organizationSlug, chapterSlug]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) fetchVideos();
    }, 5000);
    return () => clearInterval(interval);
  }, [chapter.id]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [categoriesResponse, organizationsResponse] = await Promise.all([
        axiosInstance.get('/api/vault/categories/'),
        axiosInstance.get('/api/vault/organizations/')
      ]);

      const foundCategory = categoriesResponse.data.find(
        (cat: any) => (cat.slug || slugify(cat.name)) === categorySlug
      );
      
      const foundOrganization = organizationsResponse.data.find(
        (org: any) => (org.slug || slugify(org.name)) === organizationSlug
      );

      if (!foundCategory || !foundOrganization) {
        navigate('/home');
        return;
      }

      setCategory(foundCategory);
      setOrganization(foundOrganization);

      // Fetch chapters for this org and find by slug
      const chaptersRes = await axiosInstance.get(`/api/vault/chapters/?organization=${foundOrganization.id}`);
      const foundChapter = chaptersRes.data.find(
        (ch: any) => slugify(ch.name) === chapterSlug
      );

      if (!foundChapter) {
        navigate(`/${categorySlug}/${organizationSlug}`);
        return;
      }

      setChapter(foundChapter);

      const videosResponse = await axiosInstance.get(`${API_ENDPOINTS.VIDEOS.LIST}?chapter=${foundChapter.id}`);
      setVideos(videosResponse.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      navigate('/home');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchVideos = async () => {
    if (!chapter.id) return;
    try {
      const response = await axiosInstance.get(`${API_ENDPOINTS.VIDEOS.LIST}?chapter=${chapter.id}`);
      setVideos(response.data);
    } catch (error) {
      console.error('Failed to fetch videos:', error);
    }
  };

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(0);
    setUploadPhase('Preparing upload…');

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
        if (chapter.id) formData.append('chapter', chapter.id.toString());

        const chunkWeight = 1 / totalChunks;

        await axiosInstance.post(API_ENDPOINTS.VIDEOS.UPLOAD, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const chunkPct = (progressEvent.loaded / progressEvent.total) * chunkWeight;
              const overallPct = ((chunkIndex / totalChunks) + chunkPct) * 95; // 95% = upload, 5% = finalize
              setUploadProgress(Math.min(overallPct, 95));
              setUploadPhase(`Uploading chunk ${chunkIndex + 1} of ${totalChunks}…`);
            }
          },
        });
      }

      setUploadPhase('Finalizing upload…');
      setUploadProgress(97);

      await axiosInstance.post(API_ENDPOINTS.VIDEOS.COMPLETE, {
        upload_id: uploadId,
        filename: file.name,
        total_chunks: totalChunks,
        organization: organization.id,
        category: category.id,
        chapter: chapter.id || undefined,
      });

      setUploadProgress(100);
      setUploadPhase('Upload complete!');

      // Brief pause so the user sees 100%
      await new Promise((r) => setTimeout(r, 600));

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
      await axiosInstance.delete(API_ENDPOINTS.VIDEOS.DELETE(videoId));
      setVideos((prev) => prev.filter((v) => v.id !== videoId));
    } catch (error) {
      console.error('Failed to delete video:', error);
    }
  };

  const handleSync = async () => {
    if (!organization.id) return;
    
    setIsSyncing(true);
    setSyncMessage(null);
    
    try {
      const response = await axiosInstance.post(API_ENDPOINTS.VIDEOS.SYNC, {
        organization_id: organization.id,
        chapter_id: chapter.id || undefined,
      });
      
      const { message, synced = 0, deleted = 0 } = response.data;
      setSyncMessage(message);

      // Refresh the video list whenever anything changed
      if (synced > 0 || deleted > 0) {
        await fetchVideos();
      }
      
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
        <Navbar theme={theme} onThemeToggle={toggleTheme} />
        <div className="org-videos-loading">
          <Loader2 size={48} className="spin-animation" />
          <p>Loading videos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="yt-page">
      <Navbar theme={theme} onThemeToggle={toggleTheme} />

      <main className="org-videos-main">
        {/* Breadcrumb */}
        <nav className="org-breadcrumb">
          <span className="org-breadcrumb-item" onClick={() => navigate('/home')}>{category.name}</span>
          <span className="org-breadcrumb-sep">›</span>
          <span className="org-breadcrumb-item" onClick={() => navigate(`/${categorySlug}/${organizationSlug}`)}>{organization.name}</span>
          <span className="org-breadcrumb-sep">›</span>
          <span className="org-breadcrumb-current">{chapter.name}</span>
        </nav>

        {/* Header */}
        <div className="org-videos-header">
          <div className="org-header-left">
            <button onClick={() => navigate(`/${categorySlug}/${organizationSlug}`)} className="org-back-btn">
              <ArrowLeft size={20} />
              <span className="org-back-btn-text">Back</span>
            </button>
            
            <div className="org-info-header">
              {organization.logo_url && (
                <img src={organization.logo_url} alt="" className="org-logo-large" />
              )}
              <div className="org-info-text">
                <h1 className="org-name-large">{chapter.name}</h1>
                <p className="org-video-count">{videos.length} video{videos.length !== 1 ? 's' : ''}</p>
              </div>
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
              <span className="org-btn-text">{isSyncing ? 'Syncing...' : 'Sync'}</span>
            </button>
            
            <button className="org-upload-btn" onClick={() => setShowUploadModal(true)}>
              <Upload size={20} />
              <span className="org-btn-text">Upload</span>
            </button>
            
            <button className="org-upload-btn org-telegram-btn" onClick={() => setShowTelegramModal(true)}>
              <Send size={20} />
              <span className="org-btn-text">Telegram</span>
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
                categorySlug={categorySlug!}
                organizationSlug={organizationSlug!}
                chapterSlug={chapterSlug!}
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
        uploadProgress={uploadProgress}
        uploadPhase={uploadPhase}
      />

      {/* Telegram Upload Modal */}
      <TelegramUploadModal
        isOpen={showTelegramModal}
        onClose={() => setShowTelegramModal(false)}
        organizationId={organization.id}
        categoryId={category.id}
        onDownloadStarted={fetchVideos}
      />
    </div>
  );
};

export default OrganizationVideosPage;
