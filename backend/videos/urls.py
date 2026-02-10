from django.urls import path
from .views import (
    ChunkedUploadView, CompleteUploadView, VideoListView, VideoDetailView,
    StreamVideoView, VideoDeleteView, VideoAbortView, SyncDriveVideosView,
    StreamAssetView, VideoRenameView,
    PDFUploadView, PDFListView, PDFDetailView, PDFDeleteView, StreamPDFView,
    PDFAnnotationListView, PDFAnnotationDetailView,
)

urlpatterns = [
    path('upload/chunk/', ChunkedUploadView.as_view(), name='video-upload'),
    path('upload/complete/', CompleteUploadView.as_view(), name='video-complete'),
    path('list/', VideoListView.as_view(), name='video-list'),
    path('detail/<int:pk>/', VideoDetailView.as_view(), name='video-detail'),
    path('stream/<str:file_id>/', StreamVideoView.as_view(), name='video-stream'),
    path('asset/<str:file_id>/', StreamAssetView.as_view(), name='video-asset'),
    path('sync/', SyncDriveVideosView.as_view(), name='video-sync'),
    path('<int:pk>/rename/', VideoRenameView.as_view(), name='video-rename'),
    path('<int:pk>/abort/', VideoAbortView.as_view(), name='video-abort'),
    path('<int:pk>/', VideoDeleteView.as_view(), name='video-delete'),
    # PDF endpoints
    path('pdfs/upload/', PDFUploadView.as_view(), name='pdf-upload'),
    path('pdfs/list/', PDFListView.as_view(), name='pdf-list'),
    path('pdfs/<int:pk>/', PDFDetailView.as_view(), name='pdf-detail'),
    path('pdfs/<int:pk>/delete/', PDFDeleteView.as_view(), name='pdf-delete'),
    path('pdfs/stream/<str:file_id>/', StreamPDFView.as_view(), name='pdf-stream'),
    path('pdfs/<int:pdf_id>/annotations/', PDFAnnotationListView.as_view(), name='pdf-annotations'),
    path('pdfs/annotations/<int:pk>/', PDFAnnotationDetailView.as_view(), name='pdf-annotation-detail'),
]
