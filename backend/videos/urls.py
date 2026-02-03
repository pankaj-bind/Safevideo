from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    VaultViewSet, SubjectViewSet, ChapterViewSet, VideoViewSet,
    VideoUploadView, VideoListView, StreamVideoView, VideoDeleteView
)

# Router for ViewSets
router = DefaultRouter()
router.register(r'vaults', VaultViewSet, basename='vault')
router.register(r'subjects', SubjectViewSet, basename='subject')
router.register(r'chapters', ChapterViewSet, basename='chapter')
router.register(r'items', VideoViewSet, basename='video-item')

urlpatterns = [
    # ViewSet routes
    path('', include(router.urls)),
    
    # Legacy routes (kept for backward compatibility)
    path('upload/', VideoUploadView.as_view(), name='video-upload'),
    path('list/', VideoListView.as_view(), name='video-list'),
    path('stream/<str:file_id>/', StreamVideoView.as_view(), name='video-stream'),
    path('<int:pk>/', VideoDeleteView.as_view(), name='video-delete'),
]
