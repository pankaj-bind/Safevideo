import React, { useEffect, useMemo, useRef, useState } from 'react';

export type VideoPlayerLayoutProps = {
  videoSrc: string;
  title: string;
  uploadedAt?: string;
  notesStorageKey: string;
};

const formatTimestamp = (seconds: number) => {
  const clamped = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(clamped / 60);
  const remainingSeconds = clamped % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const insertAtSelection = (value: string, selectionStart: number, selectionEnd: number, insert: string) => {
  const before = value.slice(0, selectionStart);
  const after = value.slice(selectionEnd);
  const nextValue = `${before}${insert}${after}`;
  const nextCaret = before.length + insert.length;
  return { nextValue, nextCaret };
};

const VideoPlayerLayout: React.FC<VideoPlayerLayoutProps> = ({ videoSrc, title, uploadedAt, notesStorageKey }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [notes, setNotes] = useState('');

  // Set default playback speed to 2x
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = 2;
    }
  }, [videoSrc]);

  useEffect(() => {
    const saved = localStorage.getItem(notesStorageKey);
    if (saved) setNotes(saved);
  }, [notesStorageKey]);

  useEffect(() => {
    localStorage.setItem(notesStorageKey, notes);
  }, [notesStorageKey, notes]);

  // Keyboard shortcuts for video player
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      const v = videoRef.current;
      if (!v) return;

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          v.currentTime = Math.min(v.currentTime + 10, v.duration || 0);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          v.currentTime = Math.max(v.currentTime - 10, 0);
          break;
        case ' ':
          e.preventDefault();
          v.paused ? v.play() : v.pause();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          v.muted = !v.muted;
          break;
        case 'ArrowUp':
          e.preventDefault();
          v.volume = Math.min(1, v.volume + 0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          v.volume = Math.max(0, v.volume - 0.1);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const uploadedAtText = useMemo(() => {
    if (!uploadedAt) return '';
    try {
      const d = new Date(uploadedAt);
      if (Number.isNaN(d.getTime())) return uploadedAt;
      return d.toLocaleString();
    } catch {
      return uploadedAt;
    }
  }, [uploadedAt]);

  const handleNotesKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter') return;

    e.preventDefault();

    const videoSeconds = videoRef.current?.currentTime ?? 0;
    const stamp = `[${formatTimestamp(videoSeconds)}] `;

    const el = e.currentTarget;
    const selectionStart = el.selectionStart ?? notes.length;
    const selectionEnd = el.selectionEnd ?? notes.length;

    const insert = `\n${stamp}`;
    const { nextValue, nextCaret } = insertAtSelection(notes, selectionStart, selectionEnd, insert);
    setNotes(nextValue);

    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  return (
    <div className="watch-layout">
      <div className="watch-left">
        <div className="watch-left-scroll">
          <div className="watch-player">
            <video ref={videoRef} controls preload="metadata" crossOrigin="use-credentials">
              <source src={videoSrc} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>

          <div className="watch-meta">
            <h1 className="watch-title">{title}</h1>
            {uploadedAtText ? <p className="watch-date">{uploadedAtText}</p> : null}
          </div>
        </div>
      </div>

      <aside className="watch-notes">
        <div className="watch-notes-header">Session Notes</div>
        <div className="watch-notes-body">
          <textarea
            ref={textareaRef}
            className="watch-notes-textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onKeyDown={handleNotesKeyDown}
            placeholder="Write in Markdown…\n\nPress Enter to insert a timestamped line."
            spellCheck={false}
          />
        </div>
      </aside>
    </div>
  );
};

export default VideoPlayerLayout;
