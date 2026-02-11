from rest_framework import generics, status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser
from django.db import models
from django.http import StreamingHttpResponse
from django.core.cache import cache
from .models import Video
from .services import start_background_processing, DriveService, cancel_processing, start_sync_metadata
from .models import PDFDocument, PDFAnnotation
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

class VideoRenameView(APIView):
    """Rename a video title in DB and on Google Drive."""
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk):
        try:
            new_title = request.data.get('title', '').strip()
            if not new_title:
                return Response({'error': 'Title is required'}, status=status.HTTP_400_BAD_REQUEST)
            if len(new_title) > 255:
                return Response({'error': 'Title must be 255 characters or less'}, status=status.HTTP_400_BAD_REQUEST)

            video = Video.objects.get(id=pk, user=request.user)
            old_title = video.title

            # Rename on Google Drive
            try:
                drive = DriveService()
                # Rename the Drive subfolder if it exists
                if video.drive_folder_id:
                    new_folder_name = os.path.splitext(new_title)[0]
                    drive.rename_folder(video.drive_folder_id, new_folder_name)
                # Rename the video file itself on Drive
                if video.file_id:
                    drive.rename_file(video.file_id, f'Processed_{new_title}')
            except Exception as e:
                logger.warning(f"Drive rename failed for video {pk}: {e} — updating DB only")

            video.title = new_title
            video.save(update_fields=['title', 'updated_at'])

            return Response(_build_video_dict(video, request), status=status.HTTP_200_OK)
        except Video.DoesNotExist:
            return Response({'error': 'Video not found'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Rename error: {e}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


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
            # Phase 1 – Check if the Drive folder itself still exists
            # =================================================================
            drive_folder_id = drive_service.folder_exists_in_path(folder_path)

            if drive_folder_id is None:
                # The entire folder was deleted from Drive → purge all videos and PDFs
                purge_filter = {
                    'organization': organization,
                    'user': request.user,
                }
                if chapter:
                    purge_filter['chapter'] = chapter

                deleted_qs = Video.objects.filter(**purge_filter)
                deleted_count = deleted_qs.count()
                deleted_qs.delete()

                deleted_pdf_qs = PDFDocument.objects.filter(**purge_filter)
                pdf_deleted_count = deleted_pdf_qs.count()
                deleted_pdf_qs.delete()

                return Response({
                    'message': f'Drive folder no longer exists. Removed {deleted_count} video(s) and {pdf_deleted_count} PDF(s) from the app.',
                    'synced': 0,
                    'deleted': deleted_count,
                    'pdf_synced': 0,
                    'pdf_deleted': pdf_deleted_count,
                    'total': 0,
                }, status=status.HTTP_200_OK)

            # =================================================================
            # Phase 2 – List current Drive contents
            # =================================================================
            drive_files = drive_service.list_folder_files(folder_path)
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

            # =============================================================
            # Phase 5 – Sync PDFs (cleanup stale + import new from Drive)
            # =============================================================
            pdf_deleted_count = 0
            pdf_synced_count = 0

            try:
                # 5a – List PDFs currently on Drive
                drive_pdfs = drive_service.list_folder_pdfs(folder_path)
                drive_pdf_file_ids = {f.get('id') for f in drive_pdfs if f.get('id')}
                drive_pdf_subfolder_ids = {
                    f.get('drive_folder_id') for f in drive_pdfs if f.get('drive_folder_id')
                }

                # 5b – Remove DB PDFs whose Drive file no longer exists
                pdf_filter = {
                    'organization': organization,
                    'user': request.user,
                    'file_id__isnull': False,
                }
                if chapter:
                    pdf_filter['chapter'] = chapter

                db_pdfs = PDFDocument.objects.filter(**pdf_filter)
                for pdf in db_pdfs:
                    still_on_drive = False
                    if pdf.file_id and pdf.file_id in drive_pdf_file_ids:
                        still_on_drive = True
                    elif pdf.drive_folder_id and pdf.drive_folder_id in drive_pdf_subfolder_ids:
                        still_on_drive = True

                    if not still_on_drive:
                        if pdf.drive_folder_id:
                            still_on_drive = drive_service.file_exists(pdf.drive_folder_id)
                        elif pdf.file_id:
                            still_on_drive = drive_service.file_exists(pdf.file_id)

                    if not still_on_drive:
                        logger.info(f"Sync: removing PDF {pdf.id} '{pdf.title}' — no longer on Drive")
                        pdf.delete()
                        pdf_deleted_count += 1

                # 5c – Import new PDFs from Drive → DB
                remaining_pdf_file_ids = set(
                    PDFDocument.objects.filter(**pdf_filter).values_list('file_id', flat=True)
                )

                for drive_pdf in drive_pdfs:
                    file_id = drive_pdf.get('id')
                    if file_id in remaining_pdf_file_ids:
                        continue

                    PDFDocument.objects.create(
                        user=request.user,
                        category=organization.category,
                        organization=organization,
                        chapter=chapter,
                        title=drive_pdf.get('name', 'Untitled.pdf'),
                        file_id=file_id,
                        drive_folder_id=drive_pdf.get('drive_folder_id'),
                        folder_path=folder_path,
                        file_size=int(drive_pdf.get('size', 0)),
                    )
                    pdf_synced_count += 1

            except Exception as e:
                logger.warning(f"PDF sync phase failed: {e}")

            # Build human-readable message
            parts = []
            if synced_count:
                parts.append(f'Added {synced_count} new video{"s" if synced_count != 1 else ""}')
            if deleted_count:
                parts.append(f'Removed {deleted_count} deleted video{"s" if deleted_count != 1 else ""}')
            if pdf_synced_count:
                parts.append(f'Added {pdf_synced_count} new PDF{"s" if pdf_synced_count != 1 else ""}')
            if pdf_deleted_count:
                parts.append(f'Removed {pdf_deleted_count} deleted PDF{"s" if pdf_deleted_count != 1 else ""}')
            if not parts:
                parts.append('Everything is already in sync')
            message = '. '.join(parts) + '.'

            return Response({
                'message': message,
                'synced': synced_count,
                'deleted': deleted_count,
                'pdf_synced': pdf_synced_count,
                'pdf_deleted': pdf_deleted_count,
                'total': len(drive_files),
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Sync error: {e}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# =============================================================================
# PDF VIEWS
# =============================================================================

def _build_pdf_dict(pdf, request):
    """Build a serializable dict for a PDFDocument instance."""
    stream_url = None
    if pdf.file_id:
        stream_url = request.build_absolute_uri(f'/api/videos/pdfs/stream/{pdf.file_id}/')
    return {
        'id': pdf.id,
        'title': pdf.title,
        'file_id': pdf.file_id,
        'file_size': pdf.file_size,
        'page_count': pdf.page_count,
        'folder_path': pdf.folder_path,
        'chapter_id': pdf.chapter_id,
        'organization_id': pdf.organization_id,
        'stream_url': stream_url,
        'created_at': pdf.created_at,
        'updated_at': pdf.updated_at,
    }


class PDFUploadView(APIView):
    """Upload a PDF file to Google Drive."""
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser)

    MAX_PDF_SIZE = 500 * 1024 * 1024  # 500 MB

    def post(self, request):
        try:
            pdf_file = request.FILES.get('file')
            if not pdf_file:
                return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)

            if not pdf_file.content_type == 'application/pdf':
                return Response({'error': 'Only PDF files are allowed'}, status=status.HTTP_400_BAD_REQUEST)

            if pdf_file.size > self.MAX_PDF_SIZE:
                return Response(
                    {'error': f'PDF exceeds maximum size of {self.MAX_PDF_SIZE // (1024**2)} MB'},
                    status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
                )

            title = request.data.get('title', pdf_file.name)
            category_id = request.data.get('category')
            organization_id = request.data.get('organization')
            chapter_id = request.data.get('chapter')

            # Build folder path
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

            # Save PDF to temp file
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
                for chunk in pdf_file.chunks():
                    tmp.write(chunk)
                tmp_path = tmp.name

            try:
                # Upload PDF directly into the chapter/org folder (no subfolder)
                drive = DriveService()
                if folder_path:
                    parent_folder_id = drive.get_or_create_folder(folder_path)
                else:
                    parent_folder_id = os.environ.get('GOOGLE_DRIVE_FOLDER_ID')

                file_id = drive.upload_to_folder(
                    tmp_path, title, parent_folder_id,
                    mime_override='application/pdf'
                )

                # Create DB record
                pdf_doc = PDFDocument.objects.create(
                    user=request.user,
                    title=title,
                    file_id=file_id,
                    drive_folder_id=None,
                    folder_path=folder_path,
                    file_size=pdf_file.size,
                    category_id=category_id if category_id else None,
                    organization_id=organization_id if organization_id else None,
                    chapter_id=chapter_id if chapter_id else None,
                )

                return Response(_build_pdf_dict(pdf_doc, request), status=status.HTTP_201_CREATED)

            finally:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)

        except Exception as e:
            logger.error(f"PDF Upload error: {e}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class PDFListView(APIView):
    """List PDFs for the current user, filtered by organization/chapter.
    
    Verifies each PDF still exists on Google Drive and removes stale records.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        queryset = PDFDocument.objects.filter(user=request.user).order_by('-created_at')

        organization_id = request.query_params.get('organization')
        if organization_id:
            queryset = queryset.filter(organization_id=organization_id)

        chapter_id = request.query_params.get('chapter')
        if chapter_id:
            queryset = queryset.filter(chapter_id=chapter_id)

        # Verify each PDF still exists on Drive; remove stale records
        try:
            drive = DriveService()
        except Exception:
            drive = None

        valid_pdfs = []
        for pdf in queryset:
            if drive and pdf.file_id:
                if not drive.file_exists(pdf.file_id):
                    logger.info(f"PDFList: removing stale PDF {pdf.id} '{pdf.title}' — no longer on Drive")
                    pdf.delete()
                    continue
            valid_pdfs.append(_build_pdf_dict(pdf, request))

        return Response(valid_pdfs)


class PDFDetailView(APIView):
    """Get a single PDF by ID."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        try:
            pdf = PDFDocument.objects.get(id=pk, user=request.user)
            return Response(_build_pdf_dict(pdf, request))
        except PDFDocument.DoesNotExist:
            return Response({'error': 'PDF not found'}, status=status.HTTP_404_NOT_FOUND)


class PDFDeleteView(APIView):
    """Delete a PDF and its Drive assets."""
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk):
        try:
            pdf = PDFDocument.objects.get(id=pk, user=request.user)
            try:
                drive = DriveService()
                if pdf.drive_folder_id:
                    drive.delete_folder(pdf.drive_folder_id)
                elif pdf.file_id:
                    drive.delete_file(pdf.file_id)
            except Exception as e:
                logger.warning(f"Failed to delete Drive assets for PDF {pk}: {e}")
            pdf.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except PDFDocument.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)


class StreamPDFView(APIView):
    """Stream a PDF from Google Drive with Range support."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, file_id):
        try:
            pdf = PDFDocument.objects.filter(user=request.user, file_id=file_id).first()
            if not pdf:
                return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

            drive_service = DriveService()
            file_size = pdf.file_size
            if not file_size:
                meta = drive_service.get_file_metadata(file_id)
                file_size = meta['size']
                if file_size:
                    PDFDocument.objects.filter(id=pdf.id).update(file_size=file_size)

            range_header = request.META.get('HTTP_RANGE', '').strip()

            if range_header and file_size:
                try:
                    range_spec = range_header.replace('bytes=', '')
                    parts = range_spec.split('-')
                    start = int(parts[0]) if parts[0] else 0
                    if parts[1]:
                        end = int(parts[1])
                    else:
                        end = file_size - 1
                    end = min(end, file_size - 1)
                except (ValueError, IndexError):
                    start = 0
                    end = file_size - 1

                content_length = end - start + 1
                file_iterator = drive_service.get_file_range_iterator(file_id, start=start, end=end)
                response = StreamingHttpResponse(file_iterator, status=206, content_type='application/pdf')
                response['Content-Range'] = f'bytes {start}-{end}/{file_size}'
                response['Content-Length'] = str(content_length)
            else:
                file_iterator = drive_service.get_file_iterator(file_id)
                response = StreamingHttpResponse(file_iterator, content_type='application/pdf')
                if file_size:
                    response['Content-Length'] = str(file_size)

            response['Accept-Ranges'] = 'bytes'
            response['Content-Disposition'] = f'inline; filename="{pdf.title}"'
            response['Cache-Control'] = 'private, max-age=3600'
            return response
        except Exception as e:
            logger.error(f"PDF stream error: {e}")
            return Response({'error': 'Failed to stream PDF'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class PDFAnnotationListView(APIView):
    """List / create annotations for a PDF."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pdf_id):
        try:
            pdf = PDFDocument.objects.get(id=pdf_id, user=request.user)
        except PDFDocument.DoesNotExist:
            return Response({'error': 'PDF not found'}, status=status.HTTP_404_NOT_FOUND)

        page = request.query_params.get('page')
        qs = PDFAnnotation.objects.filter(pdf=pdf, user=request.user)
        if page:
            qs = qs.filter(page=int(page))

        annotations = list(qs.values('id', 'page', 'annotation_type', 'data', 'created_at', 'updated_at'))
        return Response(annotations)

    def post(self, request, pdf_id):
        try:
            pdf = PDFDocument.objects.get(id=pdf_id, user=request.user)
        except PDFDocument.DoesNotExist:
            return Response({'error': 'PDF not found'}, status=status.HTTP_404_NOT_FOUND)

        page = request.data.get('page')
        annotation_type = request.data.get('annotation_type')
        data = request.data.get('data')

        if not all([page, annotation_type, data]):
            return Response({'error': 'page, annotation_type, and data are required'}, status=status.HTTP_400_BAD_REQUEST)

        annotation = PDFAnnotation.objects.create(
            pdf=pdf,
            user=request.user,
            page=int(page),
            annotation_type=annotation_type,
            data=data,
        )

        return Response({
            'id': annotation.id,
            'page': annotation.page,
            'annotation_type': annotation.annotation_type,
            'data': annotation.data,
            'created_at': annotation.created_at,
            'updated_at': annotation.updated_at,
        }, status=status.HTTP_201_CREATED)


class PDFAnnotationDetailView(APIView):
    """Update / delete a single annotation."""
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk):
        try:
            annotation = PDFAnnotation.objects.get(id=pk, user=request.user)
        except PDFAnnotation.DoesNotExist:
            return Response({'error': 'Annotation not found'}, status=status.HTTP_404_NOT_FOUND)

        if 'data' in request.data:
            annotation.data = request.data['data']
        if 'page' in request.data:
            annotation.page = int(request.data['page'])
        if 'annotation_type' in request.data:
            annotation.annotation_type = request.data['annotation_type']
        annotation.save()

        return Response({
            'id': annotation.id,
            'page': annotation.page,
            'annotation_type': annotation.annotation_type,
            'data': annotation.data,
            'created_at': annotation.created_at,
            'updated_at': annotation.updated_at,
        })

    def delete(self, request, pk):
        try:
            annotation = PDFAnnotation.objects.get(id=pk, user=request.user)
            annotation.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except PDFAnnotation.DoesNotExist:
            return Response({'error': 'Annotation not found'}, status=status.HTTP_404_NOT_FOUND)

