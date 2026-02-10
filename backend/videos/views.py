from rest_framework import generics, status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser
from django.db import models
from django.http import StreamingHttpResponse
from django.core.cache import cache
from .models import Video
from .services import start_background_processing, DriveService, cancel_processing, start_sync_metadata
import tempfile
import os
import hashlib
import time
import logging

logger = logging.getLogger(__name__)


def _build_video_dict(video, request):
    """Build a serializable dict for a Video instance with media URLs."""
    # Build streaming URLs for thumbnail/preview (stored as Drive file IDs)
    thumbnail_url = None
    preview_url = None
    if video.thumbnail:
        thumbnail_url = request.build_absolute_uri(f'/api/videos/asset/{video.thumbnail}/?type=image')
    if video.preview:
        preview_url = request.build_absolute_uri(f'/api/videos/asset/{video.preview}/?type=video')
    
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
        'thumbnail_url': thumbnail_url,
        'preview_url': preview_url,
        'chapter_id': video.chapter_id,
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
            chapter_id = request.data.get('chapter')
            
            chunk_view = ChunkedUploadView()
            metadata_key = chunk_view._get_upload_metadata_key(upload_id)
            metadata = cache.get(metadata_key)
            
            if not metadata or len(metadata['uploaded_chunks']) != total_chunks:
                return Response({'error': 'Upload incomplete or expired'}, status=status.HTTP_400_BAD_REQUEST)

            upload_path = chunk_view._get_upload_path(upload_id)
            
            # Build folder path from category/organization/chapter
            folder_path = None
            if category_id and organization_id:
                from vault.models import Category, Organization, Chapter
                try:
                    category = Category.objects.get(id=category_id, user=request.user)
                    organization = Organization.objects.get(id=organization_id, category=category)
                    if chapter_id:
                        chapter = Chapter.objects.get(id=chapter_id, organization=organization)
                        folder_path = f"{category.name}/{organization.name}/{chapter.name}"
                    else:
                        folder_path = f"{category.name}/{organization.name}"
                except (Category.DoesNotExist, Organization.DoesNotExist, Chapter.DoesNotExist):
                    pass
            
            # Create DB Record
            video = Video.objects.create(
                user=request.user,
                title=filename,
                status='PENDING',
                category_id=category_id if category_id else None,
                organization_id=organization_id if organization_id else None,
                chapter_id=chapter_id if chapter_id else None,
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
        
        # Filter by chapter if provided
        chapter_id = request.query_params.get('chapter')
        if chapter_id:
            queryset = queryset.filter(chapter_id=chapter_id)
        
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
    """Stream video with HTTP Range support for instant playback.

    Supports partial-content responses (206) so the browser can seek
    and buffer progressively without downloading the entire file first.
    """
    permission_classes = [permissions.IsAuthenticated]

    # Cap open-ended range requests to 2 MB so the first response is fast
    INITIAL_CHUNK_CAP = 2 * 1024 * 1024  # 2 MB

    def get(self, request, file_id):
        try:
            # Fetch the video record — gives us ownership check AND cached file_size
            video = Video.objects.filter(user=request.user, file_id=file_id).first()
            if not video:
                return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

            drive_service = DriveService()

            # Use DB-stored file_size to avoid an extra Drive API round-trip.
            # Fall back to the Drive API only when the DB value is missing.
            file_size = video.file_size
            content_type = video.mime_type or 'video/mp4'
            if not file_size:
                meta = drive_service.get_file_metadata(file_id)
                file_size = meta['size']
                content_type = meta.get('mimeType', content_type)
                # Cache it for future requests
                if file_size:
                    Video.objects.filter(id=video.id).update(
                        file_size=file_size, mime_type=content_type
                    )

            range_header = request.META.get('HTTP_RANGE', '').strip()

            if range_header and file_size:
                # Parse Range header  (e.g. "bytes=0-999999")
                try:
                    range_spec = range_header.replace('bytes=', '')
                    parts = range_spec.split('-')
                    start = int(parts[0]) if parts[0] else 0
                    # If end is unspecified ("bytes=0-") cap to INITIAL_CHUNK_CAP
                    # for fast initial load; the browser will request more as needed.
                    if parts[1]:
                        end = int(parts[1])
                    else:
                        end = min(start + self.INITIAL_CHUNK_CAP - 1, file_size - 1)
                    end = min(end, file_size - 1)
                except (ValueError, IndexError):
                    start = 0
                    end = min(self.INITIAL_CHUNK_CAP - 1, file_size - 1)

                content_length = end - start + 1
                file_iterator = drive_service.get_file_range_iterator(file_id, start=start, end=end)

                response = StreamingHttpResponse(file_iterator, status=206, content_type=content_type)
                response['Content-Range'] = f'bytes {start}-{end}/{file_size}'
                response['Content-Length'] = str(content_length)
            else:
                # No Range header — serve the full file
                file_iterator = drive_service.get_file_iterator(file_id)
                response = StreamingHttpResponse(file_iterator, content_type=content_type)
                if file_size:
                    response['Content-Length'] = str(file_size)

            response['Accept-Ranges'] = 'bytes'
            response['Content-Disposition'] = 'inline; filename="video.mp4"'
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
            # Delete entire Drive folder (contains video + thumbnail + preview)
            try:
                drive = DriveService()
                if video.drive_folder_id:
                    drive.delete_folder(video.drive_folder_id)
                elif video.file_id:
                    drive.delete_file(video.file_id)
            except Exception as e:
                logger.warning(f"Failed to delete Drive assets for video {pk}: {e}")
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


class StreamAssetView(APIView):
    """Stream thumbnail or preview from Google Drive.
    
    Serves assets stored on Drive (thumbnail.jpg, preview.mp4) with proper
    content types and caching headers.
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request, file_id):
        try:
            # Verify the user owns a video with this asset
            if not Video.objects.filter(
                user=request.user
            ).filter(
                models.Q(thumbnail=file_id) | models.Q(preview=file_id)
            ).exists():
                return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
            
            asset_type = request.query_params.get('type', 'image')
            if asset_type == 'video':
                content_type = 'video/mp4'
            else:
                content_type = 'image/jpeg'
            
            drive_service = DriveService()
            file_iterator = drive_service.get_file_iterator(file_id)
            response = StreamingHttpResponse(file_iterator, content_type=content_type)
            response['Cache-Control'] = 'public, max-age=86400'  # Cache 24 hours
            return response
        except Exception as e:
            logger.error(f"Asset stream error: {e}")
            return Response({'error': 'Failed to stream asset'}, status=status.HTTP_404_NOT_FOUND)


class SyncDriveVideosView(APIView):
    """Two-way sync between Google Drive and the local database.

    1. **Import** – new videos found on Drive are added to the DB.
    2. **Cleanup** – videos/folders that no longer exist on Drive are removed
       from the DB so the app stays in sync.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            organization_id = request.data.get('organization_id')
            chapter_id = request.data.get('chapter_id')

            if not organization_id:
                return Response({'error': 'organization_id required'}, status=status.HTTP_400_BAD_REQUEST)

            from vault.models import Organization, Chapter
            try:
                organization = Organization.objects.get(id=organization_id, category__user=request.user)
            except Organization.DoesNotExist:
                return Response({'error': 'Organization not found'}, status=status.HTTP_404_NOT_FOUND)

            # Build folder path (includes chapter when provided)
            chapter = None
            if chapter_id:
                try:
                    chapter = Chapter.objects.get(id=chapter_id, organization=organization)
                    folder_path = f"{organization.category.name}/{organization.name}/{chapter.name}"
                except Chapter.DoesNotExist:
                    return Response({'error': 'Chapter not found'}, status=status.HTTP_404_NOT_FOUND)
            else:
                folder_path = f"{organization.category.name}/{organization.name}"

            drive_service = DriveService()

            # =================================================================
            # Phase 1 – Ensure the Drive folder hierarchy exists
            # =================================================================
            # Use get_or_create_folder so that:
            #   a) brand-new chapters get their Drive folder created automatically
            #   b) manually created Drive structures are navigated correctly
            # If a segment is missing it will be created rather than treating it
            # as a "deleted" folder.
            try:
                drive_folder_id = drive_service.get_or_create_folder(folder_path)
            except Exception as e:
                logger.error(f"Sync: cannot reach Drive folder '{folder_path}': {e}")
                return Response(
                    {'error': f'Cannot access Google Drive folder: {e}'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            # =================================================================
            # Phase 2 – List current Drive contents
            # =================================================================
            drive_files = drive_service.list_folder_files(folder_path, folder_id=drive_folder_id)
            drive_file_ids = {f.get('id') for f in drive_files if f.get('id')}
            # Also collect subfolder (drive_folder) IDs for videos stored in subfolders
            drive_subfolder_ids = {
                f.get('drive_folder_id') for f in drive_files if f.get('drive_folder_id')
            }

            # =================================================================
            # Phase 3 – Remove DB videos whose Drive file no longer exists
            # =================================================================
            existing_filter = {
                'organization': organization,
                'user': request.user,
                'file_id__isnull': False,
            }
            if chapter:
                existing_filter['chapter'] = chapter

            db_videos = Video.objects.filter(**existing_filter)

            deleted_count = 0
            for video in db_videos:
                still_on_drive = False

                # Check by file_id (present in drive_file_ids list)
                if video.file_id and video.file_id in drive_file_ids:
                    still_on_drive = True
                # For subfolder-based videos, check the parent folder
                elif video.drive_folder_id and video.drive_folder_id in drive_subfolder_ids:
                    still_on_drive = True

                if not still_on_drive:
                    # Double-check via Drive API (handles pagination edge cases)
                    if video.drive_folder_id:
                        still_on_drive = drive_service.file_exists(video.drive_folder_id)
                    elif video.file_id:
                        still_on_drive = drive_service.file_exists(video.file_id)

                if not still_on_drive:
                    logger.info(f"Sync: removing video {video.id} '{video.title}' — no longer on Drive")
                    video.delete()
                    deleted_count += 1

            # =================================================================
            # Phase 4 – Import new videos from Drive → DB
            # =================================================================
            # Re-fetch existing file_ids after deletions
            remaining_file_ids = set(
                Video.objects.filter(**existing_filter).values_list('file_id', flat=True)
            )

            synced_count = 0
            new_video_ids = []
            for drive_file in drive_files:
                file_id = drive_file.get('id')
                if file_id in remaining_file_ids:
                    continue

                # Extract duration from Drive API videoMediaMetadata (milliseconds)
                drive_duration = None
                vmm = drive_file.get('videoMediaMetadata')
                if vmm and vmm.get('durationMillis'):
                    try:
                        drive_duration = int(vmm['durationMillis']) / 1000.0
                    except (ValueError, TypeError):
                        pass

                video = Video.objects.create(
                    user=request.user,
                    category=organization.category,
                    organization=organization,
                    chapter=chapter,
                    title=drive_file.get('name', 'Untitled'),
                    file_id=file_id,
                    drive_folder_id=drive_file.get('drive_folder_id'),
                    folder_path=folder_path,
                    file_size=int(drive_file.get('size', 0)),
                    mime_type=drive_file.get('mimeType'),
                    thumbnail=drive_file.get('thumbnail_id'),
                    preview=drive_file.get('preview_id'),
                    duration=drive_duration,
                    status='COMPLETED'
                )
                new_video_ids.append(video.id)
                synced_count += 1

            # Generate metadata (thumbnail, preview, duration) for new videos
            for vid_id in new_video_ids:
                start_sync_metadata(vid_id)

            # Also generate metadata for existing videos that are missing it
            missing_filter = {
                'organization': organization,
                'user': request.user,
                'status': 'COMPLETED',
                'file_id__isnull': False,
            }
            if chapter:
                missing_filter['chapter'] = chapter

            # Back-fill duration for existing videos using Drive metadata
            drive_file_map = {f.get('id'): f for f in drive_files if f.get('id')}
            existing_no_duration = Video.objects.filter(
                **missing_filter, duration__isnull=True,
            ).exclude(id__in=new_video_ids)
            for vid in existing_no_duration:
                df = drive_file_map.get(vid.file_id)
                if df:
                    vmm = df.get('videoMediaMetadata')
                    if vmm and vmm.get('durationMillis'):
                        try:
                            vid.duration = int(vmm['durationMillis']) / 1000.0
                            vid.save(update_fields=['duration'])
                        except (ValueError, TypeError):
                            pass

            existing_missing = Video.objects.filter(
                **missing_filter
            ).filter(
                models.Q(thumbnail='') | models.Q(thumbnail__isnull=True) |
                models.Q(preview='') | models.Q(preview__isnull=True) |
                models.Q(duration__isnull=True)
            ).exclude(id__in=new_video_ids).values_list('id', flat=True)

            for vid_id in existing_missing:
                start_sync_metadata(vid_id)

            # Build human-readable message
            parts = []
            if synced_count:
                parts.append(f'Added {synced_count} new video{"s" if synced_count != 1 else ""}')
            if deleted_count:
                parts.append(f'Removed {deleted_count} deleted video{"s" if deleted_count != 1 else ""}')
            if not parts:
                parts.append('Everything is already in sync')
            message = '. '.join(parts) + '.'

            return Response({
                'message': message,
                'synced': synced_count,
                'deleted': deleted_count,
                'total': len(drive_files),
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Sync error: {e}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

