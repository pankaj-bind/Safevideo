from django.urls import path
from .views import ChunkedUploadView, CompleteUploadView, VideoListView, StreamVideoView, VideoDeleteView, VideoAbortView

urlpatterns = [
    path('upload/chunk/', ChunkedUploadView.as_view(), name='video-upload'), # Main upload endpoint
    path('upload/complete/', CompleteUploadView.as_view(), name='video-complete'),
    path('list/', VideoListView.as_view(), name='video-list'),
    path('stream/<str:file_id>/', StreamVideoView.as_view(), name='video-stream'),
    path('<int:pk>/abort/', VideoAbortView.as_view(), name='video-abort'),
    path('<int:pk>/', VideoDeleteView.as_view(), name='video-delete'),
]
