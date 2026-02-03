from rest_framework import generics, status, permissions, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import action
from django.http import StreamingHttpResponse, HttpResponse
from django.shortcuts import get_object_or_404
from .models import Vault, Subject, Chapter, Video
from .serializers import (
    VaultSerializer, VaultDetailSerializer,
    SubjectSerializer, SubjectDetailSerializer,
    ChapterSerializer, ChapterDetailSerializer,
    VideoSerializer, VideoCreateSerializer
)
from .services import start_background_processing, DriveService
import tempfile
import os
import io


# =============================================================================
# VAULT VIEWSET
# =============================================================================

class VaultViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Vault CRUD operations.
    All vaults are scoped to the authenticated user.
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action == 'retrieve':
            return VaultDetailSerializer
        return VaultSerializer
    
    def get_queryset(self):
        return Vault.objects.filter(user=self.request.user)
    
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


# =============================================================================
# SUBJECT VIEWSET
# =============================================================================

class SubjectViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Subject CRUD operations.
    Subjects are scoped to vaults owned by the authenticated user.
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action == 'retrieve':
            return SubjectDetailSerializer
        return SubjectSerializer
    
    def get_queryset(self):
        queryset = Subject.objects.filter(vault__user=self.request.user)
        vault_id = self.request.query_params.get('vault')
        if vault_id:
            queryset = queryset.filter(vault_id=vault_id)
        return queryset
    
    def perform_create(self, serializer):
        # Verify user owns the vault
        vault_id = self.request.data.get('vault')
        vault = get_object_or_404(Vault, id=vault_id, user=self.request.user)
        serializer.save()


# =============================================================================
# CHAPTER VIEWSET
# =============================================================================

class ChapterViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Chapter CRUD operations.
    Chapters are scoped to subjects in vaults owned by the authenticated user.
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action == 'retrieve':
            return ChapterDetailSerializer
        return ChapterSerializer
    
    def get_queryset(self):
        queryset = Chapter.objects.filter(subject__vault__user=self.request.user)
        subject_id = self.request.query_params.get('subject')
        if subject_id:
            queryset = queryset.filter(subject_id=subject_id)
        return queryset.select_related('subject__vault')
    
    def perform_create(self, serializer):
        # Verify user owns the vault through subject
        subject_id = self.request.data.get('subject')
        subject = get_object_or_404(Subject, id=subject_id, vault__user=self.request.user)
        serializer.save()
    
    @action(detail=True, methods=['get'])
    def breadcrumb(self, request, pk=None):
        """Get breadcrumb data for navigation."""
        chapter = self.get_object()
        return Response({
            'vault': {'id': chapter.subject.vault.id, 'title': chapter.subject.vault.title},
            'subject': {'id': chapter.subject.id, 'title': chapter.subject.title},
            'chapter': {'id': chapter.id, 'title': chapter.title}
        })


# =============================================================================
# VIDEO VIEWSET
# =============================================================================

class VideoViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Video CRUD operations.
    Videos are scoped to chapters in subjects in vaults owned by the authenticated user.
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action == 'create':
            return VideoCreateSerializer
        return VideoSerializer
    
    def get_queryset(self):
        queryset = Video.objects.filter(user=self.request.user)
        chapter_id = self.request.query_params.get('chapter')
        if chapter_id:
            queryset = queryset.filter(chapter_id=chapter_id)
        return queryset.select_related('chapter__subject__vault')
    
    def perform_create(self, serializer):
        # Verify user owns the vault through chapter->subject->vault
        chapter_id = self.request.data.get('chapter')
        if chapter_id:
            chapter = get_object_or_404(Chapter, id=chapter_id, subject__vault__user=self.request.user)
        serializer.save(user=self.request.user)
    
    def perform_destroy(self, instance):
        # Delete from Google Drive if file_id exists
        if instance.file_id:
            try:
                drive_service = DriveService()
                drive_service.delete_file(instance.file_id)
            except Exception as e:
                print(f"Warning: Could not delete from Drive: {e}")
        instance.delete()


# =============================================================================
# LEGACY VIEWS (Kept for backward compatibility)
# =============================================================================

class VideoUploadView(APIView):
    """
    Handle video file uploads to Google Drive.
    Now supports chapter_id for hierarchical organization.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if 'file' not in request.FILES:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)
        
        file_obj = request.FILES['file']
        chapter_id = request.data.get('chapter_id')
        title = request.data.get('title', file_obj.name)
        description = request.data.get('description', '')
        
        # Validate chapter if provided
        chapter = None
        if chapter_id:
            try:
                chapter = Chapter.objects.get(
                    id=chapter_id, 
                    subject__vault__user=request.user
                )
            except Chapter.DoesNotExist:
                return Response(
                    {'error': 'Chapter not found or access denied'}, 
                    status=status.HTTP_404_NOT_FOUND
                )
        
        # Save file to a temporary location
        # usage of delete=False to allow other threads to access it
        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as temp_file:
            for chunk in file_obj.chunks():
                temp_file.write(chunk)
            temp_file_path = temp_file.name
        
        # Create Video Record
        video = Video.objects.create(
            user=request.user,
            chapter=chapter,
            title=title,
            description=description,
            video_type='UPLOAD',
            status='PENDING'
        )

        # Start Background Processing
        start_background_processing(video.id, temp_file_path, file_obj.name)

        return Response({
            'message': 'Video upload received. Processing started.',
            'id': video.id,
            'status': video.status
        }, status=status.HTTP_202_ACCEPTED)

class VideoListView(generics.ListAPIView):
    serializer_class = None # We will define a simple serializer or just use values
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        videos = Video.objects.filter(user=request.user).order_by('-created_at').values(
            'id', 'title', 'status', 'error_message', 'created_at', 'file_id'
        )
        return Response(videos)

class StreamVideoView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, file_id):
        """Stream video from Google Drive using generator-based approach.
        
        This method uses DriveService.get_file_iterator() which yields chunks
        progressively, avoiding memory issues with large files (373MB+).
        """
        try:
            drive_service = DriveService()
            
            # Get the file iterator (generator) that yields chunks
            file_iterator = drive_service.get_file_iterator(file_id)
            
            # StreamingHttpResponse accepts an iterator and streams chunks to client
            response = StreamingHttpResponse(file_iterator, content_type='video/mp4')
            response['Content-Disposition'] = 'inline; filename="video.mp4"'
            
            # Note: We intentionally do NOT set Content-Length header here because:
            # 1. Getting file size requires an extra API call
            # 2. Browser can still play videos without it (just can't show total duration initially)
            # 3. Setting incorrect Content-Length can cause playback issues
            
            return response

        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)


class VideoDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk):
        try:
            video = Video.objects.get(id=pk, user=request.user)
            
            # Delete from Google Drive if file_id exists
            if video.file_id:
                try:
                    drive_service = DriveService()
                    drive_service.delete_file(video.file_id)
                except Exception as e:
                    print(f"Warning: Could not delete from Drive: {e}")
            
            video.delete()
            return Response({'message': 'Video deleted successfully'}, status=status.HTTP_204_NO_CONTENT)
        
        except Video.DoesNotExist:
            return Response({'error': 'Video not found'}, status=status.HTTP_404_NOT_FOUND)
