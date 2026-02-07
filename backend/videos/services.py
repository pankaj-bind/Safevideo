import os
import json
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor
import tempfile
import time
import io
import logging

from django.conf import settings
from django.db import connection, close_old_connections

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request, AuthorizedSession
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload

from .models import Video

# Path to token.json
TOKEN_PATH = os.path.join(settings.BASE_DIR, 'token.json')
logger = logging.getLogger(__name__)

# =============================================================================
# Video Processing Worker Pool
# =============================================================================
DEFAULT_MAX_WORKERS = max(1, min(4, (os.cpu_count() or 2) // 2))
MAX_WORKERS = int(os.environ.get('VIDEO_PROCESSING_WORKERS', DEFAULT_MAX_WORKERS))
PROCESSING_EXECUTOR = ThreadPoolExecutor(max_workers=MAX_WORKERS)
PROCESS_REGISTRY = {}
PROCESS_REGISTRY_LOCK = threading.Lock()


def register_processing(video_id, process, temp_file_path, output_path, cancel_event):
    with PROCESS_REGISTRY_LOCK:
        PROCESS_REGISTRY[video_id] = {
            'process': process,
            'temp_file_path': temp_file_path,
            'output_path': output_path,
            'cancel_event': cancel_event,
        }


def unregister_processing(video_id):
    with PROCESS_REGISTRY_LOCK:
        return PROCESS_REGISTRY.pop(video_id, None)


def cancel_processing(video_id):
    with PROCESS_REGISTRY_LOCK:
        info = PROCESS_REGISTRY.get(video_id)

    if not info:
        return False

    info['cancel_event'].set()
    process = info.get('process')

    if process and process.poll() is None:
        process.terminate()

    return True

class DriveService:
    def __init__(self):
        self.creds = None
        if os.path.exists(TOKEN_PATH):
            self.creds = Credentials.from_authorized_user_file(TOKEN_PATH, ['https://www.googleapis.com/auth/drive.file'])
        
        if not self.creds or not self.creds.valid:
            if self.creds and self.creds.expired and self.creds.refresh_token:
                self.creds.refresh(Request())
            else:
                raise Exception("Google Drive credentials not valid. Run setup_auth.py first.")
        
        self.service = build('drive', 'v3', credentials=self.creds)

    def upload_file(self, file_path, title, folder_path=None, progress_callback=None, mime_override=None):
        """Upload file to Google Drive with optimized 10MB chunks for faster upload.
        
        Args:
            file_path: Path to the local file
            title: Name for the file in Drive
            folder_path: Optional category/organization path (e.g., "Work/ProjectA")
            progress_callback: Optional callable(float) receiving 0.0-1.0 progress
            mime_override: Optional MIME type override (default: video/mp4)
        
        Performance Notes:
        - 10MB chunks reduce HTTP overhead significantly vs default 256KB
        - Resumable upload allows recovery from network interruptions
        - Typically 2-3x faster upload for large files (500MB+)
        """
        # Get or create folder hierarchy
        parent_folder_id = os.environ.get('GOOGLE_DRIVE_FOLDER_ID')
        
        if folder_path and parent_folder_id:
            # Create nested folder structure: root -> category -> organization
            folder_names = folder_path.split('/')
            current_parent = parent_folder_id
            
            for folder_name in folder_names:
                # Check if folder exists
                query = f"name='{folder_name}' and '{current_parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
                results = self.service.files().list(q=query, spaces='drive', fields='files(id, name)').execute()
                folders = results.get('files', [])
                
                if folders:
                    current_parent = folders[0]['id']
                else:
                    # Create the folder
                    folder_metadata = {
                        'name': folder_name,
                        'mimeType': 'application/vnd.google-apps.folder',
                        'parents': [current_parent]
                    }
                    folder = self.service.files().create(body=folder_metadata, fields='id').execute()
                    current_parent = folder.get('id')
            
            parent_folder_id = current_parent
        
        file_metadata = {
            'name': title,
            'parents': [parent_folder_id] if parent_folder_id else []
        }
        
        # 10MB chunks for optimal upload performance
        media = MediaFileUpload(
            file_path,
            mimetype=mime_override or 'video/mp4',
            resumable=True,
            chunksize=10 * 1024 * 1024  # 10MB chunks
        )
        
        request = self.service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id'
        )
        
        # Use resumable upload with progress callback
        response = None
        while response is None:
            upload_status, response = request.next_chunk()
            if upload_status and progress_callback:
                progress_callback(upload_status.progress())
        
        if progress_callback:
            progress_callback(1.0)
        
        return response.get('id')

    def get_file_stream(self, file_id):
        """Legacy method - kept for backward compatibility. Loads entire file into memory."""
        request = self.service.files().get_media(fileId=file_id)
        file_io = io.BytesIO()
        downloader = MediaIoBaseDownload(file_io, request)
        done = False
        while done is False:
            status, done = downloader.next_chunk()
        
        file_io.seek(0)
        return file_io

    def get_file_iterator(self, file_id):
        """Yields chunks of data from Google Drive without loading file into memory.
        
        This is the recommended method for streaming large files as it:
        - Doesn't load the entire file into memory
        - Streams data progressively to the client
        - Handles large files (100MB+) without timeout issues
        """
        # Refresh auth if needed
        if self.creds.expired and self.creds.refresh_token:
            self.creds.refresh(Request())
        
        # Create authorized session for streaming
        session = AuthorizedSession(self.creds)
        url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"
        
        # stream=True prevents loading entire response into memory
        response = session.get(url, stream=True)
        response.raise_for_status()
        
        # Yield 1MB chunks to the caller
        for chunk in response.iter_content(chunk_size=1 * 1024 * 1024):
            if chunk:
                yield chunk

    def delete_file(self, file_id):
        try:
            self.service.files().delete(fileId=file_id).execute()
        except Exception as e:
            print(f"Error deleting file from Drive: {e}")

    def list_folder_files(self, folder_path):
        """List all video files in a specific Google Drive folder path.
        
        Args:
            folder_path: Category/Organization path (e.g., "Work/ProjectA")
        
        Returns:
            List of dicts with file metadata: id, name, size, mimeType, createdTime
        """
        try:
            parent_folder_id = os.environ.get('GOOGLE_DRIVE_FOLDER_ID')
            
            if not parent_folder_id:
                raise Exception("GOOGLE_DRIVE_FOLDER_ID not configured")
            
            # Navigate to the target folder
            if folder_path:
                folder_names = folder_path.split('/')
                current_parent = parent_folder_id
                
                for folder_name in folder_names:
                    query = f"name='{folder_name}' and '{current_parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
                    results = self.service.files().list(q=query, spaces='drive', fields='files(id, name)').execute()
                    folders = results.get('files', [])
                    
                    if not folders:
                        # Folder doesn't exist yet
                        return []
                    
                    current_parent = folders[0]['id']
                
                parent_folder_id = current_parent
            
            # List all video files in the target folder
            query = f"'{parent_folder_id}' in parents and mimeType contains 'video/' and trashed=false"
            results = self.service.files().list(
                q=query,
                spaces='drive',
                fields='files(id, name, size, mimeType, createdTime)',
                orderBy='createdTime desc'
            ).execute()
            
            return results.get('files', [])
            
        except Exception as e:
            print(f"Error listing folder files: {e}")
            return []

class VideoProcessor:
    def __init__(self, input_path, output_path):
        self.input_path = input_path
        self.output_path = output_path

    def has_audio(self):
        """Checks if the video has an audio stream using ffprobe."""
        try:
            cmd = [
                'ffprobe', 
                '-v', 'error', 
                '-select_streams', 'a', 
                '-show_entries', 'stream=codec_type', 
                '-of', 'csv=p=0', 
                self.input_path
            ]
            result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            return len(result.stdout.strip()) > 0
        except Exception as e:
            print(f"Error checking audio: {e}")
            return False

    def get_duration(self):
        """Get video duration in seconds using ffprobe."""
        try:
            cmd = [
                'ffprobe',
                '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'csv=p=0',
                self.input_path
            ]
            result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            duration_str = result.stdout.strip()
            if duration_str:
                return float(duration_str)
        except Exception as e:
            logger.warning(f"Error getting duration: {e}")
        return None

    def generate_thumbnail(self, output_thumbnail_path, timestamp=1):
        """Extract a single frame as a JPEG thumbnail.
        
        Args:
            output_thumbnail_path: Path to save the thumbnail image
            timestamp: Seconds into the video to capture (default 1s)
        """
        try:
            duration = self.get_duration()
            # If video is shorter than the timestamp, capture at 0s
            if duration and timestamp >= duration:
                timestamp = 0

            cmd = [
                'ffmpeg', '-y',
                '-ss', str(timestamp),
                '-i', self.input_path,
                '-vframes', '1',
                '-vf', 'scale=640:-2',
                '-q:v', '2',  # High quality JPEG
                output_thumbnail_path
            ]
            result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
            if result.returncode == 0 and os.path.exists(output_thumbnail_path):
                return True
        except Exception as e:
            logger.warning(f"Thumbnail generation failed: {e}")
        return False

    def generate_preview(self, output_preview_path, start=1, clip_duration=6):
        """Generate a short muted preview clip for hover playback.
        
        Args:
            output_preview_path: Path to save the preview video
            start: Start time in seconds (default 1s)
            clip_duration: Duration of the preview clip in seconds (default 6s)
        """
        try:
            duration = self.get_duration()
            # Adjust start/duration for short videos
            if duration:
                if start >= duration:
                    start = 0
                if start + clip_duration > duration:
                    clip_duration = max(1, duration - start)

            cmd = [
                'ffmpeg', '-y',
                '-ss', str(start),
                '-i', self.input_path,
                '-t', str(clip_duration),
                '-vf', 'scale=480:-2',
                '-an',  # No audio for preview
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-crf', '28',
                '-movflags', '+faststart',
                '-pix_fmt', 'yuv420p',
                output_preview_path
            ]
            result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
            if result.returncode == 0 and os.path.exists(output_preview_path):
                return True
        except Exception as e:
            logger.warning(f"Preview generation failed: {e}")
        return False

    def process_video(self):
        """Speed up video 2x with quality-preserving encoding settings.
        
        Performance Optimizations (no quality compromise):
        - veryfast preset: Faster encode without reducing visual quality
        - CRF 23: High quality (lower = better). 23 is visually near‑transparent
        - threads 0: Uses all available CPU cores
        - faststart: Moves moov atom to beginning for instant web playback
        - AAC audio: Efficient codec for web compatibility
        """
        has_audio = self.has_audio()
        
        # Base command with performance optimizations (quality-preserving)
        cmd = [
            'ffmpeg',
            '-y',  # Overwrite output
            '-i', self.input_path,
            '-threads', '0',  # Use all CPU cores
            '-preset', 'veryfast',  # Faster encode, quality preserved by CRF
            '-crf', '23',  # High quality (18=visually lossless, 23=high)
        ]

        if has_audio:
            # Filter: Speed up Video (setpts) AND Audio (atempo)
            filter_complex = "[0:v]setpts=0.5*PTS[v];[0:a]atempo=2.0[a]"
            cmd.extend(['-filter_complex', filter_complex])
            cmd.extend(['-map', '[v]', '-map', '[a]'])
            # Re-encode audio with efficient AAC codec
            cmd.extend(['-c:a', 'aac', '-b:a', '128k'])
        else:
            # Filter: Speed up Video only
            filter_complex = "[0:v]setpts=0.5*PTS[v]"
            cmd.extend(['-filter_complex', filter_complex])
            cmd.extend(['-map', '[v]'])
        
        # Web optimization - move metadata to front for instant playback
        cmd.extend(['-movflags', '+faststart'])
        
        # Output file
        cmd.append(self.output_path)
        
        logger.info(f"FFmpeg command: {' '.join(cmd)}")
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return process

def _update_progress(video_id, progress):
    """Safely update video progress from background thread."""
    try:
        close_old_connections()
        Video.objects.filter(id=video_id).update(progress=min(progress, 100))
    except Exception:
        pass  # Non-critical — don't crash processing over a progress update


def process_video_background(video_id, temp_file_path, original_filename, folder_path=None):
    close_old_connections()
    
    thumbnail_path = None
    preview_path = None
    
    try:
        video = Video.objects.get(id=video_id)
        video.status = 'PROCESSING'
        video.progress = 5
        video.save()

        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as output_temp:
            output_path = output_temp.name

        processor = VideoProcessor(temp_file_path, output_path)
        cancel_event = threading.Event()
        
        # ── Get duration from the original file BEFORE processing ──
        _update_progress(video_id, 7)
        original_duration = processor.get_duration()
        
        # ── Generate thumbnail from original file (at 1 second) ──
        _update_progress(video_id, 8)
        thumbnail_dir = os.path.join(settings.MEDIA_ROOT, 'thumbnails')
        os.makedirs(thumbnail_dir, exist_ok=True)
        thumbnail_filename = f"thumb_{video_id}_{int(time.time())}.jpg"
        thumbnail_path = os.path.join(thumbnail_dir, thumbnail_filename)
        thumbnail_ok = processor.generate_thumbnail(thumbnail_path)
        
        # ── Generate preview clip from original file (6 second clip) ──
        _update_progress(video_id, 9)
        preview_dir = os.path.join(settings.MEDIA_ROOT, 'previews')
        os.makedirs(preview_dir, exist_ok=True)
        preview_filename = f"preview_{video_id}_{int(time.time())}.mp4"
        preview_path = os.path.join(preview_dir, preview_filename)
        preview_ok = processor.generate_preview(preview_path)

        # ── FFmpeg 2x speed processing ──
        process = processor.process_video()

        register_processing(video_id, process, temp_file_path, output_path, cancel_event)

        # FFmpeg phase: 10% → 40%
        _update_progress(video_id, 10)
        stdout, stderr = process.communicate()
        _update_progress(video_id, 40)

        if cancel_event.is_set():
            Video.objects.filter(id=video_id).update(
                status='CANCELED',
                progress=0,
                error_message='Processing canceled by user.'
            )
            return

        if process.returncode != 0:
            error_log = stderr.decode('utf-8')
            raise Exception(f"FFmpeg failed: {error_log}")

        # ── Get processed video duration (should be original / 2) ──
        processed_duration = None
        if original_duration:
            processed_duration = original_duration / 2.0  # 2x speed
        else:
            # Fallback: probe the processed file
            processed_processor = VideoProcessor(output_path, output_path)
            processed_duration = processed_processor.get_duration()

        # Drive upload phase: 40% → 95%
        def on_drive_progress(frac):
            pct = 40 + int(frac * 55)  # 40-95%
            _update_progress(video_id, pct)

        drive_service = DriveService()
        file_id = drive_service.upload_file(
            output_path, f"Processed_{original_filename}", folder_path,
            progress_callback=on_drive_progress
        )

        # ── Save everything to DB ──
        close_old_connections()
        video = Video.objects.get(id=video_id)
        video.file_id = file_id
        video.status = 'COMPLETED'
        video.progress = 100
        if processed_duration:
            video.duration = processed_duration
        if thumbnail_ok and os.path.exists(thumbnail_path):
            video.thumbnail = f"thumbnails/{thumbnail_filename}"
        if preview_ok and os.path.exists(preview_path):
            video.preview = f"previews/{preview_filename}"
        video.save()

        # Cleanup temp files (keep thumbnail & preview in media/)
        if os.path.exists(temp_file_path): os.unlink(temp_file_path)
        if os.path.exists(output_path): os.unlink(output_path)

    except Exception as e:
        logger.error(f"Background Processing Error: {e}")
        try:
            close_old_connections()
            video = Video.objects.get(id=video_id)
            video.status = 'FAILED'
            video.error_message = str(e)
            video.save()
        except Exception as db_e:
             print(f"Failed to save error state: {db_e}")
        
        if os.path.exists(temp_file_path): os.unlink(temp_file_path)
        if 'output_path' in locals() and os.path.exists(output_path):
            os.unlink(output_path)
    finally:
        if os.path.exists(temp_file_path):
            os.unlink(temp_file_path)
        if 'output_path' in locals() and os.path.exists(output_path):
            os.unlink(output_path)
        unregister_processing(video_id)
        close_old_connections()

def start_background_processing(video_id, temp_file_path, original_filename, folder_path=None):
    """Submit processing to the shared worker pool for parallel execution."""
    PROCESSING_EXECUTOR.submit(
        process_video_background,
        video_id,
        temp_file_path,
        original_filename,
        folder_path
    )