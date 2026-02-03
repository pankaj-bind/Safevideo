from rest_framework import generics, status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser
from django.http import StreamingHttpResponse
from django.core.cache import cache
from .models import Video
from .services import start_background_processing, DriveService, cancel_processing
import tempfile
import os
import hashlib
import time
import logging

logger = logging.getLogger(__name__)

class ChunkedUploadView(APIView):
    """
    Handle chunked video uploads for large files.
    """
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser) # ✅ REQUIRED for file uploads
    
    UPLOAD_TEMP_DIR = os.path.join(tempfile.gettempdir(), 'video_uploads')
    CHUNK_TIMEOUT = 3600 * 24 # 24 hours retention for incomplete uploads
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        os.makedirs(self.UPLOAD_TEMP_DIR, exist_ok=True)
    
    def _get_upload_path(self, upload_id: str) -> str:
        safe_id = hashlib.md5(upload_id.encode()).hexdigest()
        return os.path.join(self.UPLOAD_TEMP_DIR, f"{safe_id}.upload")
    
    def _get_upload_metadata_key(self, upload_id: str) -> str:
        return f"upload_metadata_{upload_id}"
    
    def post(self, request):
        try:
            chunk = request.FILES.get('chunk')
            upload_id = request.data.get('upload_id')
            chunk_index = int(request.data.get('chunk_index', -1))
            total_chunks = int(request.data.get('total_chunks', -1))
            filename = request.data.get('filename', 'video.mp4')
            
            if not all([chunk, upload_id, chunk_index >= 0, total_chunks > 0]):
                return Response(
                    {'error': 'Missing required fields'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Metadata tracking
            metadata_key = self._get_upload_metadata_key(upload_id)
            metadata = cache.get(metadata_key, {
                'user_id': request.user.id,
                'filename': filename,
                'total_chunks': total_chunks,
                'uploaded_chunks': set(),
                'created_at': time.time()
            })
            
            if metadata['user_id'] != request.user.id:
                return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)
            
            # Append chunk
            upload_path = self._get_upload_path(upload_id)
            with open(upload_path, 'ab') as f:
                for chunk_data in chunk.chunks():
                    f.write(chunk_data)
            
            metadata['uploaded_chunks'].add(chunk_index)
            cache.set(metadata_key, metadata, timeout=self.CHUNK_TIMEOUT)
            
            return Response({
                'message': f'Chunk {chunk_index + 1}/{total_chunks} uploaded',
                'status': 'success'
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Upload error: {e}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CompleteUploadView(APIView):
    """Finalize upload and trigger processing"""
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request):
        try:
            upload_id = request.data.get('upload_id')
            filename = request.data.get('filename', 'video.mp4')
            total_chunks = int(request.data.get('total_chunks', -1))
            
            chunk_view = ChunkedUploadView()
            metadata_key = chunk_view._get_upload_metadata_key(upload_id)
            metadata = cache.get(metadata_key)
            
            if not metadata or len(metadata['uploaded_chunks']) != total_chunks:
                return Response({'error': 'Upload incomplete or expired'}, status=status.HTTP_400_BAD_REQUEST)

            upload_path = chunk_view._get_upload_path(upload_id)
            
            # Create DB Record
            video = Video.objects.create(
                user=request.user,
                title=filename,
                status='PENDING'
            )
            
            # Trigger Background Processing
            start_background_processing(video.id, upload_path, filename)
            
            # Cleanup Cache
            cache.delete(metadata_key)
            
            return Response({
                'message': 'Upload complete',
                'id': video.id,
                'status': 'PENDING'
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Completion error: {e}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class VideoListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    def get(self, request, *args, **kwargs):
        videos = Video.objects.filter(user=request.user).order_by('-created_at').values(
            'id', 'title', 'status', 'error_message', 'created_at', 'file_id'
        )
        return Response(videos)

class StreamVideoView(APIView):
    permission_classes = [permissions.AllowAny]
    def get(self, request, file_id):
        try:
            drive_service = DriveService()
            file_iterator = drive_service.get_file_iterator(file_id)
            response = StreamingHttpResponse(file_iterator, content_type='video/mp4')
            response['Content-Disposition'] = 'inline; filename="video.mp4"'
            return response
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)

class VideoDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    def delete(self, request, pk):
        try:
            video = Video.objects.get(id=pk, user=request.user)
            if video.status in ('PENDING', 'PROCESSING'):
                cancel_processing(video.id)
            if video.file_id:
                try:
                    DriveService().delete_file(video.file_id)
                except: pass
            video.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Video.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

class VideoAbortView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    def post(self, request, pk):
        try:
            video = Video.objects.get(id=pk, user=request.user)
            if video.status in ('PENDING', 'PROCESSING'):
                cancel_processing(video.id)
                video.status = 'FAILED'
                video.error_message = 'Aborted by user'
                video.save()
            return Response({'message': 'Processing aborted'}, status=status.HTTP_200_OK)
        except Video.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
