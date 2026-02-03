from rest_framework import generics, status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from django.http import StreamingHttpResponse, HttpResponse
from .models import Video
from .services import start_background_processing, DriveService
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
    permission_classes = [permissions.AllowAny] # Allow HTML5 <video> to access it freely or use token if needed. User asked for AllowAny.

    def get(self, request, file_id):
        try:
            drive_service = DriveService()
            # Google Drive API doesn't easily support range requests with the basic download
            # For a true streaming experience with seeking, you need to handle range headers.
            # However, for this simplified requirement, we will pipe the file content.
            # CAUTION: Loading full file into memory is bad for large files. 
            # Ideally we use the `get_media` with `MediaIoBaseDownload` as a iterator or redirect to a signed URL using `webContentLink` if public.
            # But the requirement says "Streams the file bytes", so let's try to pass the iterator.
            
            # Since DriveService.get_file_stream returns BytesIO (in memory), this is not true streaming of large files.
            # Let's adjust DriveService to be more generator-friendly if possible, or just stream the BytesIO for now given constraints.
            
            # Refined approach: Use the request to get a raw stream
            
            request_drive = drive_service.service.files().get_media(fileId=file_id)
            
            # Direct streaming from Google Drive is tricky with the python client lib which wants to handle chunks itself.
            # A common workaround is to redirect if the file is public, or proxy chunks.
            # Let's read into memory for the MVP as per `services.py` implementation, 
            # observing that `get_file_stream` loads fully into file_io.
            
            file_io = drive_service.get_file_stream(file_id)
            
            response = HttpResponse(file_io, content_type='video/mp4')
            response['Content-Disposition'] = f'inline; filename="video.mp4"'
            return response

        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
