/**
 * OrganizationDetailPage Component
 * YouTube-style video management for a specific organization
 */
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useTheme } from '../hooks/useTheme';
import axiosInstance from '../api/axiosInstance';
import { API_ENDPOINTS, API_CONFIG } from '../config/api.config';
import { 
  ArrowLeft,
  Upload,
  Play,
  Pause,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  CloudUpload,
  Trash2,
  MoreVertical,
  Volume2,
  VolumeX,
  Maximize,
  SkipBack,
  SkipForward,
  X,
  StickyNote,
  Send
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { slugify } from '../utils/slugify';

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
  logo_url?: string | null;
  credential_count: number;
}

interface Category {
  id: number;
  name: string;
}

interface Note {
  id: string;
  videoId: number;
  content: string;
  timestamp?: number;
  createdAt: string;
}

// =============================================================================
// NOTES COMPONENT
// =============================================================================
const NotesSection: React.FC<{
  videoId: number;
  currentTime: number;
  onTimestampClick: (time: number) => void;
}> = ({ videoId, currentTime, onTimestampClick }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteContent, setNoteContent] = useState('');
  const [includeTimestamp, setIncludeTimestamp] = useState(false);

  // Load notes from localStorage
  useEffect(() => {
    const savedNotes = localStorage.getItem(`video_notes_${videoId}`);
    if (savedNotes) {
      setNotes(JSON.parse(savedNotes));
    } else {
      setNotes([]); // Clear notes if switching to a video with no notes
    }
  }, [videoId]);

  // Save notes to localStorage
  const saveNotes = (updatedNotes: Note[]) => {
    localStorage.setItem(`video_notes_${videoId}`, JSON.stringify(updatedNotes));
    setNotes(updatedNotes);
  };

  const formatTimestamp = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAddNote = () => {
    if (!noteContent.trim()) return;

    const newNote: Note = {
      id: Date.now().toString(),
      videoId,
      content: noteContent.trim(),
      timestamp: includeTimestamp ? Math.floor(currentTime) : undefined,
      createdAt: new Date().toISOString()
    };

    const updatedNotes = [newNote, ...notes];
    saveNotes(updatedNotes);
    setNoteContent('');
    setIncludeTimestamp(false);
  };

  const handleDeleteNote = (noteId: string) => {
    const updatedNotes = notes.filter(note => note.id !== noteId);
    saveNotes(updatedNotes);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddNote();
    }
  };

  // Parse timestamps in text and make them clickable
  const parseTimestamps = (text: string): (string | React.JSX.Element)[] => {
    // Match timestamps like 00:56, 1:23, 01:23:45
    const timestampRegex = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/g;
    const parts: (string | React.JSX.Element)[] = [];
    let lastIndex = 0;
    let match;

    while ((match = timestampRegex.exec(text)) !== null) {
      // Add text before timestamp
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }

      // Parse timestamp to seconds
      const hours = match[3] ? parseInt(match[1]) : 0;
      const minutes = match[3] ? parseInt(match[2]) : parseInt(match[1]);
      const seconds = match[3] ? parseInt(match[3]) : parseInt(match[2]);
      const totalSeconds = hours * 3600 + minutes * 60 + seconds;

      // Add clickable timestamp
      parts.push(
        <button
          key={match.index}
          className="note-timestamp-inline"
          onClick={() => onTimestampClick(totalSeconds)}
          title="Jump to this timestamp"
        >
          {match[0]}
        </button>
      );

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : [text];
  };

  return (
    <div className="notes-section">
      <div className="notes-header">
        <StickyNote size={20} />
        <h3>Notes</h3>
        <span className="notes-count">{notes.length}</span>
      </div>

      {/* Add Note Form */}
      <div className="notes-input-container">
        <textarea
          className="notes-input"
          placeholder="Write your note here..."
          value={noteContent}
          onChange={(e) => setNoteContent(e.target.value)}
          onKeyDown={handleKeyPress}
          rows={3}
        />
        <div className="notes-actions">
          <label className="notes-timestamp-toggle">
            <input
              type="checkbox"
              checked={includeTimestamp}
              onChange={(e) => setIncludeTimestamp(e.target.checked)}
            />
            <span>Add timestamp ({formatTimestamp(currentTime)})</span>
          </label>
          <button 
            className="notes-submit-btn"
            onClick={handleAddNote}
            disabled={!noteContent.trim()}
          >
            <Send size={16} />
            Add Note
          </button>
        </div>
      </div>

      {/* Notes List */}
      <div className="notes-list">
        {notes.length === 0 ? (
          <div className="notes-empty">
            <StickyNote size={48} />
            <p>No notes yet</p>
            <p className="notes-empty-hint">Start taking notes while watching the video</p>
          </div>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="note-item">
              <div className="note-content-wrapper">
                {note.timestamp !== undefined && (
                  <button 
                    className="note-timestamp"
                    onClick={() => onTimestampClick(note.timestamp!)}
                    title="Jump to this timestamp"
                  >
                    {formatTimestamp(note.timestamp)}
                  </button>
                )}
                <div className="note-content">{parseTimestamps(note.content)}</div>
              </div>
              <button 
                className="note-delete-btn"
                onClick={() => handleDeleteNote(note.id)}
                title="Delete note"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// =============================================================================
// VIDEO PLAYER COMPONENT (YouTube-style with advanced controls)
// =============================================================================
const VideoPlayer: React.FC<{
  video: Video;
  onNext: () => void;
  onPrevious: () => void;
  hasNext: boolean;
  hasPrevious: boolean;
  isTheaterMode: boolean;
  onTheaterModeToggle: () => void;
  onTimeUpdate?: (time: number) => void;
  seekToTime?: number;
}> = ({ video, onNext, hasNext, isTheaterMode, onTheaterModeToggle, onTimeUpdate, seekToTime }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playbackRates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      setCurrentTime(time);
      if (onTimeUpdate) {
        onTimeUpdate(time);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      // Sync initial playback rate with state
      videoRef.current.playbackRate = playbackRate;
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handlePlaybackRateChange = (rate: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
      setPlaybackRate(rate);
    }
    setShowSpeedMenu(false);
  };

  const handleSkipForward = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.min(videoRef.current.currentTime + 10, duration);
      setCurrentTime(Math.min(currentTime + 10, duration));
    }
  };

  const handleSkipBackward = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(videoRef.current.currentTime - 10, 0);
      setCurrentTime(Math.max(currentTime - 10, 0));
    }
  };

  const handleFullscreen = () => {
    if (playerContainerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
        setIsFullscreen(false);
      } else {
        playerContainerRef.current.requestFullscreen();
        setIsFullscreen(true);
      }
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  };

  const handleVideoEnd = () => {
    if (hasNext) {
      onNext();
    } else {
      setIsPlaying(false);
    }
  };

  useEffect(() => {
    if (videoRef.current && video.file_id) {
      videoRef.current.load();
      // Don't auto-play, user must click play
    }
  }, [video.id]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Handle seeking from notes
  useEffect(() => {
    if (seekToTime !== undefined && videoRef.current) {
      videoRef.current.currentTime = seekToTime;
      setCurrentTime(seekToTime);
    }
  }, [seekToTime]);

  return (
    <div 
      ref={playerContainerRef}
      className={`yt-player-container ${isTheaterMode ? 'yt-theater-mode' : ''} ${isFullscreen ? 'yt-fullscreen-mode' : ''}`}
      onMouseMove={handleMouseMove}
    >
      <video
        ref={videoRef}
        className="yt-video"
        preload="auto"
        crossOrigin="use-credentials"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleVideoEnd}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      >
        <source 
          src={`${API_CONFIG.BASE_URL}${API_ENDPOINTS.VIDEOS.STREAM(video.file_id!)}`} 
          type="video/mp4" 
        />
      </video>

      {/* Video Controls Overlay */}
      <div className={`yt-controls ${showControls ? 'yt-controls--visible' : ''}`}>
        {/* Center play button with skip controls */}
        <div className="yt-controls-center">
          <button 
            onClick={handleSkipBackward}
            className="yt-control-btn yt-control-btn--skip-backward"
            title="Skip 10 seconds backward"
          >
            <SkipBack size={24} />
            <span className="yt-skip-label">10s</span>
          </button>
          
          <button onClick={handlePlayPause} className="yt-control-btn yt-control-btn--play">
            {isPlaying ? <Pause size={32} /> : <Play size={32} />}
          </button>
          
          <button 
            onClick={handleSkipForward}
            className="yt-control-btn yt-control-btn--skip-forward"
            title="Skip 10 seconds forward"
          >
            <SkipForward size={24} />
            <span className="yt-skip-label">10s</span>
          </button>
        </div>

        {/* Bottom controls */}
        <div className="yt-controls-bottom">
          {/* Progress bar */}
          <div className="yt-progress">
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              className="yt-progress-bar"
            />
          </div>
          
          {/* Control buttons */}
          <div className="yt-controls-row">
            <div className="yt-controls-left">
              <button onClick={handlePlayPause} className="yt-btn" title="Play/Pause">
                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              </button>
              
              <button onClick={handleMute} className="yt-btn" title={isMuted ? "Unmute" : "Mute"}>
                {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
              
              <span className="yt-time">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>
            
            <div className="yt-controls-right">
              {/* Skip buttons */}
              <button 
                onClick={handleSkipBackward}
                className="yt-btn"
                title="Skip 10 seconds backward"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 4 9 10 15 16"></polyline>
                  <path d="M21 12a9 9 0 1 1-9-9"></path>
                </svg>
              </button>

              <button 
                onClick={handleSkipForward}
                className="yt-btn"
                title="Skip 10 seconds forward"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 4 15 10 9 16"></polyline>
                  <path d="M3 12a9 9 0 1 0 9-9"></path>
                </svg>
              </button>

              {/* Playback speed control */}
              <div className="yt-speed-control">
                <button 
                  onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                  className="yt-btn yt-speed-btn"
                  title="Playback speed"
                >
                  <span className="yt-speed-text">{playbackRate}x</span>
                </button>
                
                {showSpeedMenu && (
                  <div className="yt-speed-menu">
                    {playbackRates.map((rate) => (
                      <button
                        key={rate}
                        onClick={() => handlePlaybackRateChange(rate)}
                        className={`yt-speed-item ${playbackRate === rate ? 'yt-speed-item--active' : ''}`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Theater mode */}
              <button 
                onClick={onTheaterModeToggle}
                className="yt-btn"
                title="Theater mode"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
                  <line x1="7" y1="2" x2="7" y2="22"></line>
                  <line x1="17" y1="2" x2="17" y2="22"></line>
                  <line x1="2" y1="12" x2="22" y2="12"></line>
                </svg>
              </button>

              {/* Fullscreen */}
              <button 
                onClick={handleFullscreen}
                className="yt-btn"
                title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              >
                {isFullscreen ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                  </svg>
                ) : (
                  <Maximize size={20} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// VIDEO LIST ITEM (Sidebar)
// =============================================================================
const VideoListItem: React.FC<{
  video: Video;
  isActive: boolean;
  index: number;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}> = ({ video, isActive, index, onClick, onDelete }) => {
  const [showMenu, setShowMenu] = useState(false);

  const getStatusIcon = () => {
    switch (video.status) {
      case 'COMPLETED':
        return <CheckCircle size={14} className="text-green" />;
      case 'PROCESSING':
        return <Loader2 size={14} className="text-blue spin-animation" />;
      case 'FAILED':
        return <AlertCircle size={14} className="text-red" />;
      default:
        return <Clock size={14} className="text-yellow" />;
    }
  };

  return (
    <div 
      className={`yt-list-item ${isActive ? 'yt-list-item--active' : ''} ${video.status !== 'COMPLETED' ? 'yt-list-item--disabled' : ''}`}
      onClick={onClick}
    >
      <span className="yt-list-index">{index + 1}</span>
      
      <div className="yt-list-thumb">
        {video.status === 'COMPLETED' && video.file_id ? (
          <div className="yt-thumb-play">
            {isActive ? <Pause size={16} /> : <Play size={16} />}
          </div>
        ) : (
          <div className="yt-thumb-status">
            {getStatusIcon()}
          </div>
        )}
      </div>

      <div className="yt-list-info">
        <h4 className="yt-list-title">{video.title}</h4>
        <p className="yt-list-meta">
          {video.status === 'COMPLETED' 
            ? formatDistanceToNow(new Date(video.created_at), { addSuffix: true })
            : video.status.toLowerCase()
          }
        </p>
      </div>

      <div className="yt-list-actions">
        <button 
          className="yt-list-menu-btn"
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
        >
          <MoreVertical size={16} />
        </button>
        
        {showMenu && (
          <>
            <div className="yt-menu-backdrop" onClick={(e) => { e.stopPropagation(); setShowMenu(false); }} />
            <div className="yt-list-menu">
              <button 
                className="yt-menu-item yt-menu-item--danger"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onDelete(e);
                }}
              >
                <Trash2 size={16} />
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// UPLOAD MODAL
// =============================================================================
const UploadModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File) => void;
  isUploading: boolean;
  uploadError: string | null;
}> = ({ isOpen, onClose, onUpload, isUploading, uploadError }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) {
      onUpload(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="yt-upload-modal" onClick={(e) => e.stopPropagation()}>
        <div className="yt-upload-header">
          <h3>Upload Video</h3>
          <button onClick={onClose} className="yt-close-btn" disabled={isUploading}>
            <X size={20} />
          </button>
        </div>
        
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
          onDrop={handleDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={`yt-upload-zone ${isDragOver ? 'yt-upload-zone--active' : ''} ${isUploading ? 'yt-upload-zone--disabled' : ''}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileChange}
            className="hidden"
            disabled={isUploading}
          />

          {isUploading ? (
            <div className="yt-upload-content">
              <div className="yt-upload-spinner">
                <Loader2 size={48} className="spin-animation" />
              </div>
              <p className="yt-upload-text">Uploading...</p>
            </div>
          ) : (
            <div className="yt-upload-content">
              <CloudUpload size={48} />
              <p className="yt-upload-text">Drag & drop or click to upload</p>
              <p className="yt-upload-hint">MP4, MOV, AVI supported</p>
            </div>
          )}
        </div>

        {uploadError && (
          <div className="yt-upload-error">
            <AlertCircle size={16} />
            {uploadError}
          </div>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================
const OrganizationDetailPage: React.FC = () => {
  const { categorySlug, organizationSlug, chapterSlug, videoSlug } = useParams<{ 
    categorySlug: string; 
    organizationSlug: string;
    chapterSlug: string;
    videoSlug: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const videoIdFromState = location.state?.videoId;
  const { theme, toggleTheme } = useTheme();

  const [organization, setOrganization] = useState<Organization>({ id: 0, name: '', credential_count: 0 });
  const [category, setCategory] = useState<Category>({ id: 0, name: '' });
  const [chapter, setChapter] = useState<{ id: number; name: string }>({ id: 0, name: '' });
  const [videos, setVideos] = useState<Video[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const [seekToTime, setSeekToTime] = useState<number | undefined>(undefined);

  useEffect(() => {
    fetchData();
  }, [categorySlug, organizationSlug, chapterSlug, videoSlug]);

  useEffect(() => {
    if (!chapter.id || isUploading) return;
    const interval = setInterval(fetchVideos, 10000); // Increased to 10 seconds
    return () => clearInterval(interval);
  }, [chapter.id, isUploading]);

  // Auto-select video when videos load
  useEffect(() => {
    if (videos.length === 0) return;
    
    if (videoSlug || videoIdFromState) {
      const foundVideo = videos.find((v: Video) => {
        if (videoIdFromState) return v.id === videoIdFromState;
        const vSlug = slugify(v.title);
        return vSlug === videoSlug;
      });
      if (foundVideo && foundVideo.status === 'COMPLETED' && foundVideo.file_id) {
        setSelectedVideo(foundVideo);
      }
    } else if (!selectedVideo) {
      // If no video slug, select first completed video
      const completedVideo = videos.find(v => v.status === 'COMPLETED' && v.file_id);
      if (completedVideo) {
        setSelectedVideo(completedVideo);
      }
    }
  }, [videos, videoSlug, videoIdFromState]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      // Fetch all organizations and categories to find by slug
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

      // Resolve chapter from slug
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
        formData.append('chapter', chapter.id.toString());

        await axiosInstance.post(API_ENDPOINTS.VIDEOS.UPLOAD, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      await axiosInstance.post(API_ENDPOINTS.VIDEOS.COMPLETE, {
        upload_id: uploadId,
        filename: file.name,
        total_chunks: totalChunks,
        organization: organization.id,
        category: category.id,
        chapter_id: chapter.id
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
    if (!window.confirm('Delete this video?')) return;
    
    if (selectedVideo?.id === videoId) {
      setSelectedVideo(null);
    }
    
    setVideos(prev => prev.filter(v => v.id !== videoId));
    try {
      await axiosInstance.delete(API_ENDPOINTS.VIDEOS.DELETE(videoId));
    } catch (error) {
      await fetchVideos();
    }
  };

  const handleSelectVideo = (video: Video) => {
    if (video.status === 'COMPLETED' && video.file_id) {
      const videoSlug = slugify(video.title);
      navigate(`/${categorySlug}/${organizationSlug}/${chapterSlug}/${videoSlug}`, { state: { videoId: video.id } });
    }
  };

  const handleJumpToTimestamp = (time: number) => {
    // Use a unique value to allow repeated seeks to the same time
    setSeekToTime(time + Math.random() * 0.001);
  };

  const handleNextVideo = () => {
    const currentIndex = videos.findIndex(v => v.id === selectedVideo?.id);
    const nextVideos = videos.slice(currentIndex + 1);
    const nextCompleted = nextVideos.find(v => v.status === 'COMPLETED' && v.file_id);
    if (nextCompleted) {
      setSelectedVideo(nextCompleted);
    }
  };

  const handlePreviousVideo = () => {
    const currentIndex = videos.findIndex(v => v.id === selectedVideo?.id);
    const prevVideos = videos.slice(0, currentIndex).reverse();
    const prevCompleted = prevVideos.find(v => v.status === 'COMPLETED' && v.file_id);
    if (prevCompleted) {
      setSelectedVideo(prevCompleted);
    }
  };

  const hasNextVideo = () => {
    const currentIndex = videos.findIndex(v => v.id === selectedVideo?.id);
    return videos.slice(currentIndex + 1).some(v => v.status === 'COMPLETED' && v.file_id);
  };

  const hasPreviousVideo = () => {
    const currentIndex = videos.findIndex(v => v.id === selectedVideo?.id);
    return videos.slice(0, currentIndex).some(v => v.status === 'COMPLETED' && v.file_id);
  };

  if (isLoading) {
    return (
      <div className="yt-page">
        <Navbar theme={theme} onThemeToggle={toggleTheme} />
        <div className="yt-loading">
          <Loader2 size={48} className="spin-animation" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!organization || !category) {
    return (
      <div className="yt-page">
        <Navbar theme={theme} onThemeToggle={toggleTheme} />
        <div className="yt-error">
          <AlertCircle size={48} />
          <h3>Organization not found</h3>
          <button onClick={() => navigate('/home')} className="yt-back-link">
            <ArrowLeft size={18} />
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="yt-page">
      <Navbar theme={theme} onThemeToggle={toggleTheme} />

      <main className={`yt-main ${isTheaterMode ? 'yt-main--theater' : ''}`}>
        {/* Video Player and Content Section */}
        <div className="yt-content-wrapper">
          {/* Video Player */}
          <div className="yt-player-section">
            {selectedVideo && selectedVideo.file_id ? (
              <>
                <VideoPlayer
                  video={selectedVideo}
                  onNext={handleNextVideo}
                  onPrevious={handlePreviousVideo}
                  hasNext={hasNextVideo()}
                  hasPrevious={hasPreviousVideo()}
                  isTheaterMode={isTheaterMode}
                  onTheaterModeToggle={() => setIsTheaterMode(!isTheaterMode)}
                  onTimeUpdate={setCurrentVideoTime}
                  seekToTime={seekToTime}
                />
                {/* Video Info */}
                <div className="yt-video-info">
                  <h1 className="yt-video-main-title">{selectedVideo.title}</h1>
                  <div className="yt-video-meta-row">
                    <span className="yt-views">
                      Uploaded {formatDistanceToNow(new Date(selectedVideo.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="yt-empty-player">
                <Play size={64} />
                <h3>Select a video to play</h3>
                <p>Choose from the playlist below</p>
              </div>
            )}
          </div>

          {/* Playlist Section - Below Video */}
          <div className="yt-playlist-section">
            <div className="yt-playlist-section-header">
              <div className="yt-org-info-inline">
                <button 
                  onClick={() => navigate(`/${categorySlug}/${organizationSlug}/${chapterSlug}`)} 
                  className="yt-back-btn-inline"
                >
                  <ArrowLeft size={18} />
                </button>
                {organization.logo_url && (
                  <img src={organization.logo_url} alt="" className="yt-org-logo-inline" />
                )}
                <div>
                  <p className="yt-org-category-inline">{category.name} › {organization.name}</p>
                  <h2 className="yt-org-name-inline">{chapter.name}</h2>
                </div>
              </div>
              <button 
                className="yt-upload-btn-inline"
                onClick={() => setShowUploadModal(true)}
              >
                <Upload size={18} />
                Upload Video
              </button>
            </div>

            <div className="yt-playlist-header">
              <h3>Playlist</h3>
              <span className="yt-playlist-count">{videos.length} video{videos.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Video List */}
            <div className="yt-video-list-horizontal">
              {videos.length === 0 ? (
                <div className="yt-empty-list">
                  <p>No videos yet</p>
                  <p className="yt-empty-hint">Upload your first video!</p>
                </div>
              ) : (
                videos.map((video, index) => (
                  <VideoListItem
                    key={video.id}
                    video={video}
                    index={index}
                    isActive={selectedVideo?.id === video.id}
                    onClick={() => handleSelectVideo(video)}
                    onDelete={(e) => {
                      e.stopPropagation();
                      handleDelete(video.id);
                    }}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Side - Notes Section */}
        <div className="yt-notes-sidebar">
          {selectedVideo && selectedVideo.file_id ? (
            <NotesSection
              videoId={selectedVideo.id}
              currentTime={currentVideoTime}
              onTimestampClick={handleJumpToTimestamp}
            />
          ) : (
            <div className="notes-empty-state">
              <StickyNote size={64} />
              <h3>No video selected</h3>
              <p>Select a video to start taking notes</p>
            </div>
          )}
        </div>
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

export default OrganizationDetailPage;
