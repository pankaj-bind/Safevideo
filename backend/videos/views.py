from rest_framework import generics, status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from django.http import StreamingHttpResponse, HttpResponse
from .models import Video
from .services import start_background_processing, DriveService, cancel_processing
import tempfile
import os
import io

class VideoUploadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if 'file' not in request.FILES:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)
        
        file_obj = request.FILES['file']
        
        # Save file to a temporary location
        # usage of delete=False to allow other threads to access it
        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as temp_file:
            for chunk in file_obj.chunks():
                temp_file.write(chunk)
            temp_file_path = temp_file.name
        
        # Create Video Record
        video = Video.objects.create(
            user=request.user,
            title=file_obj.name,
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

            # Cancel processing if still running
            if video.status in ('PENDING', 'PROCESSING'):
                cancel_processing(video.id)
            
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


class VideoAbortView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            video = Video.objects.get(id=pk, user=request.user)

            if video.status not in ('PENDING', 'PROCESSING'):
                return Response({'error': 'Video is not processing'}, status=status.HTTP_400_BAD_REQUEST)

            canceled = cancel_processing(video.id)
            video.status = 'CANCELED'
            video.error_message = 'Processing canceled by user.'
            video.save()

            # If canceled, allow user to delete right away
            if canceled:
                if video.file_id:
                    try:
                        drive_service = DriveService()
                        drive_service.delete_file(video.file_id)
                    except Exception as e:
                        print(f"Warning: Could not delete from Drive: {e}")
                video.delete()
                return Response({'message': 'Processing aborted and video deleted.'}, status=status.HTTP_200_OK)

            return Response({'message': 'Abort requested.'}, status=status.HTTP_200_OK)

        except Video.DoesNotExist:
            return Response({'error': 'Video not found'}, status=status.HTTP_404_NOT_FOUND)
