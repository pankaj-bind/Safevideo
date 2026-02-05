import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { API_ENDPOINTS, API_CONFIG } from '../config/api.config';
import VideoPlayerLayout from '../components/VideoPlayerLayout';
import type { Video } from '../types/models';

const WatchPage: React.FC = () => {
  const navigate = useNavigate();
  const { videoId } = useParams();

  const parsedId = Number(videoId);
  const [video, setVideo] = useState<Video | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(parsedId)) {
      setError('Invalid video id');
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        setIsLoading(true);
        const response = await axiosInstance.get<Video>(API_ENDPOINTS.VIDEOS.DETAIL(parsedId));
        if (!cancelled) setVideo(response.data);
      } catch (e: any) {
        if (!cancelled) {
          setError(e.response?.status === 404 ? 'Video not found' : 'Failed to load video');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [parsedId]);

  const videoSrc = useMemo(() => {
    if (!video?.file_id) return '';
    return `${API_CONFIG.BASE_URL}${API_ENDPOINTS.VIDEOS.STREAM(video.file_id)}`;
  }, [video]);

  if (isLoading) {
    return (
      <div style={{ padding: 16, color: 'var(--text-primary)' }}>
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 16, color: 'var(--text-primary)' }}>
        <p style={{ marginBottom: 12 }}>{error}</p>
        <button className="sv-action" onClick={() => navigate('/videos')}>Back</button>
      </div>
    );
  }

  if (!video) {
    return (
      <div style={{ padding: 16, color: 'var(--text-primary)' }}>
        <p style={{ marginBottom: 12 }}>Video not found.</p>
        <button className="sv-action" onClick={() => navigate('/videos')}>Back</button>
      </div>
    );
  }

  if (video.status !== 'COMPLETED' || !video.file_id) {
    return (
      <div style={{ padding: 16, color: 'var(--text-primary)' }}>
        <p style={{ marginBottom: 8 }}>{video.title}</p>
        <p style={{ marginBottom: 12, color: 'var(--text-secondary)' }}>
          This video is not ready yet (status: {video.status}).
        </p>
        <button className="sv-action" onClick={() => navigate('/videos')}>Back</button>
      </div>
    );
  }

  return (
    <VideoPlayerLayout
      videoSrc={videoSrc}
      title={video.title}
      uploadedAt={video.created_at}
      notesStorageKey={`sv-session-notes:${video.id}`}
    />
  );
};

export default WatchPage;
