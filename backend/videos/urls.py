from django.urls import path
from .views import VideoUploadView, VideoListView, StreamVideoView

urlpatterns = [
    path('upload/', VideoUploadView.as_view(), name='video-upload'),
    path('list/', VideoListView.as_view(), name='video-list'),
    path('stream/<str:file_id>/', StreamVideoView.as_view(), name='video-stream'),
]
