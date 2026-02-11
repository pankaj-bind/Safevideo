/**
 * PDFThumbnail – renders the first page of a PDF as a thumbnail image.
 *
 * Uses pdf.js with IntersectionObserver for lazy loading so only visible
 * thumbnails are fetched / rendered.  Rendered data-URLs are cached in a
 * module-level Map so re-renders don't re-download.
 */
import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { FileText } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

// Module-level cache: streamUrl → dataURL
const thumbCache = new Map<string, string>();

interface Props {
  streamUrl: string;
  /** CSS width of the thumbnail container (default 100%) */
  width?: string;
  /** CSS height of the thumbnail container (default 100%) */
  height?: string;
}

const PDFThumbnail: React.FC<Props> = ({ streamUrl, width = '100%', height = '100%' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(thumbCache.get(streamUrl) ?? null);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(false);

  // Lazy-load: only start fetching when the card scrolls into view
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !streamUrl || dataUrl) return;

    let cancelled = false;

    (async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({
          url: streamUrl,
          withCredentials: true,
          cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/cmaps/',
          cMapPacked: true,
        });

        const doc = await loadingTask.promise;
        const page = await doc.getPage(1);

        // Render at a small scale to keep it lightweight
        const viewport = page.getViewport({ scale: 0.5 });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvas, viewport }).promise;

        const url = canvas.toDataURL('image/jpeg', 0.85);
        thumbCache.set(streamUrl, url);

        if (!cancelled) setDataUrl(url);

        // Clean up pdf.js resources
        doc.destroy();
      } catch (err) {
        console.warn('PDF thumbnail failed:', err);
        if (!cancelled) setFailed(true);
      }
    })();

    return () => { cancelled = true; };
  }, [visible, streamUrl, dataUrl]);

  return (
    <div
      ref={containerRef}
      style={{
        width,
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: 'var(--card-bg, #1a1a2e)',
        borderRadius: '8px 8px 0 0',
      }}
    >
      {dataUrl ? (
        <img
          src={dataUrl}
          alt="PDF preview"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'top center',
          }}
          draggable={false}
        />
      ) : failed ? (
        <FileText size={48} style={{ opacity: 0.35, color: 'var(--primary-color, #3b82f6)' }} />
      ) : (
        /* simple pulse placeholder while loading */
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'var(--primary-color, #3b82f6)',
            opacity: 0.15,
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      )}
    </div>
  );
};

export default PDFThumbnail;
