from django.urls import path
from .views import (
    ChunkedUploadView, CompleteUploadView, VideoListView, VideoDetailView,
    StreamVideoView, VideoDeleteView, VideoAbortView, SyncDriveVideosView,
    StreamAssetView
)

urlpatterns = [
    path('upload/chunk/', ChunkedUploadView.as_view(), name='video-upload'),
    path('upload/complete/', CompleteUploadView.as_view(), name='video-complete'),
    path('list/', VideoListView.as_view(), name='video-list'),
    path('detail/<int:pk>/', VideoDetailView.as_view(), name='video-detail'),
    path('stream/<str:file_id>/', StreamVideoView.as_view(), name='video-stream'),
    path('asset/<str:file_id>/', StreamAssetView.as_view(), name='video-asset'),
    path('sync/', SyncDriveVideosView.as_view(), name='video-sync'),
    path('<int:pk>/abort/', VideoAbortView.as_view(), name='video-abort'),
    path('<int:pk>/', VideoDeleteView.as_view(), name='video-delete'),
]
