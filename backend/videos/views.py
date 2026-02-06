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


def _build_video_dict(video, request):
    """Build a serializable dict for a Video instance with media URLs."""
    data = {
        'id': video.id,
        'title': video.title,
        'status': video.status,
        'progress': video.progress,
        'error_message': video.error_message,
        'created_at': video.created_at,
        'file_id': video.file_id,
        'folder_path': video.folder_path,
        'file_size': video.file_size,
        'mime_type': video.mime_type,
        'duration': video.duration,
        'thumbnail_url': request.build_absolute_uri(video.thumbnail.url) if video.thumbnail else None,
        'preview_url': request.build_absolute_uri(video.preview.url) if video.preview else None,
    }
    return data

class ChunkedUploadView(APIView):
    """
    Handle chunked video uploads for large files.
    """
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser)
    
    UPLOAD_TEMP_DIR = os.path.join(tempfile.gettempdir(), 'video_uploads')
    CHUNK_TIMEOUT = 3600 * 24  # 24 hours retention for incomplete uploads
    MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024  # 10 GB limit
    
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
            
            # Verify chunk ordering — chunks must arrive sequentially
            expected_index = len(metadata['uploaded_chunks'])
            if chunk_index != expected_index:
                return Response(
                    {'error': f'Expected chunk {expected_index}, got {chunk_index}. Chunks must be sent in order.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Check cumulative file size limit
            chunk_size = chunk.size
            current_size = metadata.get('total_size', 0)
            if current_size + chunk_size > self.MAX_FILE_SIZE:
                return Response(
                    {'error': f'File exceeds maximum size of {self.MAX_FILE_SIZE // (1024**3)} GB'},
                    status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
                )
            
            # Append chunk
            upload_path = self._get_upload_path(upload_id)
            with open(upload_path, 'ab') as f:
                for chunk_data in chunk.chunks():
                    f.write(chunk_data)
            
            metadata['uploaded_chunks'].add(chunk_index)
            metadata['total_size'] = metadata.get('total_size', 0) + chunk.size
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
            category_id = request.data.get('category')
            organization_id = request.data.get('organization')
            
            chunk_view = ChunkedUploadView()
            metadata_key = chunk_view._get_upload_metadata_key(upload_id)
            metadata = cache.get(metadata_key)
            
            if not metadata or len(metadata['uploaded_chunks']) != total_chunks:
                return Response({'error': 'Upload incomplete or expired'}, status=status.HTTP_400_BAD_REQUEST)

            upload_path = chunk_view._get_upload_path(upload_id)
            
            # Build folder path from category/organization
            folder_path = None
            if category_id and organization_id:
                from vault.models import Category, Organization
                try:
                    category = Category.objects.get(id=category_id, user=request.user)
                    organization = Organization.objects.get(id=organization_id, category=category)
                    folder_path = f"{category.name}/{organization.name}"
                except (Category.DoesNotExist, Organization.DoesNotExist):
                    pass
            
            # Create DB Record
            video = Video.objects.create(
                user=request.user,
                title=filename,
                status='PENDING',
                category_id=category_id if category_id else None,
                organization_id=organization_id if organization_id else None,
                folder_path=folder_path
            )
            
            # Trigger Background Processing with folder_path
            start_background_processing(video.id, upload_path, filename, folder_path)
            
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
        queryset = Video.objects.filter(user=request.user).order_by('-created_at')
        
        # Filter by organization if provided
        organization_id = request.query_params.get('organization')
        if organization_id:
            queryset = queryset.filter(organization_id=organization_id)
        
        # Optional pagination
        page = request.query_params.get('page')
        page_size = request.query_params.get('page_size')
        
        if page and page_size:
            try:
                page = int(page)
                page_size = min(int(page_size), 100)  # Cap at 100
                offset = (page - 1) * page_size
                total = queryset.count()
                videos = [_build_video_dict(v, request) for v in queryset[offset:offset + page_size]]
                return Response({
                    'results': videos,
                    'total': total,
                    'page': page,
                    'page_size': page_size,
                })
            except (ValueError, TypeError):
                pass
        
        # Default: return all (backward compatible)
        videos = [_build_video_dict(v, request) for v in queryset]
        return Response(videos)

class VideoDetailView(APIView):
    """Get a single video by ID"""
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request, pk):
        try:
            video = Video.objects.get(id=pk, user=request.user)
            return Response(_build_video_dict(video, request))
        except Video.DoesNotExist:
            return Response({'error': 'Video not found'}, status=status.HTTP_404_NOT_FOUND)


class StreamVideoView(APIView):
    """Stream video - requires authentication and ownership check"""
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request, file_id):
        try:
            # Verify the user owns a video with this file_id
            if not Video.objects.filter(user=request.user, file_id=file_id).exists():
                return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
            
            drive_service = DriveService()
            file_iterator = drive_service.get_file_iterator(file_id)
            response = StreamingHttpResponse(file_iterator, content_type='video/mp4')
            response['Content-Disposition'] = 'inline; filename="video.mp4"'
            response['Accept-Ranges'] = 'bytes'
            return response
        except Exception as e:
            logger.error(f"Stream error: {e}")
            return Response({'error': 'Failed to stream video'}, status=status.HTTP_404_NOT_FOUND)

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
                except Exception as e:
                    logger.warning(f"Failed to delete Drive file {video.file_id}: {e}")
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


class SyncDriveVideosView(APIView):
    """Sync videos from Google Drive folder to database"""
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request):
        try:
            organization_id = request.data.get('organization_id')
            
            if not organization_id:
                return Response({'error': 'organization_id required'}, status=status.HTTP_400_BAD_REQUEST)
            
            from vault.models import Organization
            try:
                organization = Organization.objects.get(id=organization_id, category__user=request.user)
            except Organization.DoesNotExist:
                return Response({'error': 'Organization not found'}, status=status.HTTP_404_NOT_FOUND)
            
            # Build folder path
            folder_path = f"{organization.category.name}/{organization.name}"
            
            # List files from Drive
            drive_service = DriveService()
            drive_files = drive_service.list_folder_files(folder_path)
            
            if not drive_files:
                return Response({
                    'message': 'No videos found in Drive folder',
                    'synced': 0,
                    'total': 0
                }, status=status.HTTP_200_OK)
            
            # Get existing file_ids for this organization
            existing_file_ids = set(
                Video.objects.filter(
                    organization=organization,
                    user=request.user,
                    file_id__isnull=False
                ).values_list('file_id', flat=True)
            )
            
            # Create Video records for new files
            synced_count = 0
            for drive_file in drive_files:
                file_id = drive_file.get('id')
                
                # Skip if already tracked
                if file_id in existing_file_ids:
                    continue
                
                # Create new Video record
                Video.objects.create(
                    user=request.user,
                    category=organization.category,
                    organization=organization,
                    title=drive_file.get('name', 'Untitled'),
                    file_id=file_id,
                    folder_path=folder_path,
                    file_size=int(drive_file.get('size', 0)),
                    mime_type=drive_file.get('mimeType'),
                    status='COMPLETED'  # Already in Drive, no processing needed
                )
                synced_count += 1
            
            return Response({
                'message': f'Synced {synced_count} new videos from Google Drive',
                'synced': synced_count,
                'total': len(drive_files)
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Sync error: {e}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

