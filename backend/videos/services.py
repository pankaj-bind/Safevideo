import os
import json
import subprocess
import threading
import tempfile
import time
from django.conf import settings
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload
from django.db import connection, close_old_connections
from .models import Video
import io

# Path to token.json - assuming it's in the backend directory
TOKEN_PATH = os.path.join(settings.BASE_DIR, 'token.json')

class DriveService:
    def __init__(self):
        self.creds = None
        if os.path.exists(TOKEN_PATH):
            self.creds = Credentials.from_authorized_user_file(TOKEN_PATH, ['https://www.googleapis.com/auth/drive.file'])
        
        if not self.creds or not self.creds.valid:
            raise Exception("Google Drive credentials not valid. Run setup_auth.py first.")
        
        self.service = build('drive', 'v3', credentials=self.creds)

    def upload_file(self, file_path, title):
        folder_id = getattr(settings, 'GOOGLE_DRIVE_FOLDER_ID', None)
        file_metadata = {
            'name': title,
            'parents': [folder_id] if folder_id else []
        }
        media = MediaFileUpload(file_path, mimetype='video/mp4', resumable=True)
        file = self.service.files().create(body=file_metadata, media_body=media, fields='id').execute()
        return file.get('id')

    def get_file_stream(self, file_id):
        request = self.service.files().get_media(fileId=file_id)
        file_io = io.BytesIO()
        downloader = MediaIoBaseDownload(file_io, request)
        done = False
        while done is False:
            status, done = downloader.next_chunk()
        
        file_io.seek(0)
        return file_io

    def delete_file(self, file_id):
        try:
            self.service.files().delete(fileId=file_id).execute()
        except Exception as e:
            print(f"Error deleting file from Drive: {e}")

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

    def process_video(self):
        """Speed up video 2x. Handle audio if present."""
        has_audio = self.has_audio()
        
        cmd = ['ffmpeg', '-i', self.input_path, '-y'] # -y to overwrite output

        if has_audio:
            # [0:v]setpts=0.5*PTS[v];[0:a]atempo=2.0[a]
            filter_complex = "[0:v]setpts=0.5*PTS[v];[0:a]atempo=2.0[a]"
            cmd.extend(['-filter_complex', filter_complex])
        else:
            # [0:v]setpts=0.5*PTS[v] (Do not map audio)
            filter_complex = "[0:v]setpts=0.5*PTS[v]"
            cmd.extend(['-filter_complex', filter_complex])
        
        cmd.append(self.output_path)
        
        print(f"Running FFmpeg command: {' '.join(cmd)}")
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        if result.returncode != 0:
            raise Exception(f"FFmpeg failed: {result.stderr.decode('utf-8')}")
        
        return True

def process_video_background(video_id, temp_file_path, original_filename):
    # Close old connections at start of thread
    close_old_connections()
    
    try:
        video = Video.objects.get(id=video_id)
        video.status = 'PROCESSING'
        video.save()

        # Create a temp output file
        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as output_temp:
            output_path = output_temp.name

        # Process Video
        processor = VideoProcessor(temp_file_path, output_path)
        processor.process_video()

        # Upload to Drive
        drive_service = DriveService()
        file_id = drive_service.upload_file(output_path, f"Processed_{original_filename}")

        # Update Video record
        video.file_id = file_id
        video.status = 'COMPLETED'
        video.save()

        # Cleanup
        os.unlink(temp_file_path)
        os.unlink(output_path)

    except Exception as e:
        print(f"Background Processing Error: {e}")
        # Need to re-fetch to avoid stale data issues if possible, or just update
        try:
            # Re-ensure connection is valid before writing failure
            close_old_connections()
            video = Video.objects.get(id=video_id)
            video.status = 'FAILED'
            video.error_message = str(e)
            video.save()
        except Exception as db_e:
             print(f"Failed to save error state: {db_e}")
        
        # Cleanup if files exist
        if os.path.exists(temp_file_path):
            os.unlink(temp_file_path)
        if 'output_path' in locals() and os.path.exists(output_path):
            os.unlink(output_path)
    finally:
        # Close connections at end of thread
        close_old_connections()

def start_background_processing(video_id, temp_file_path, original_filename):
    thread = threading.Thread(
        target=process_video_background, 
        args=(video_id, temp_file_path, original_filename)
    )
    thread.daemon = True
    thread.start()
