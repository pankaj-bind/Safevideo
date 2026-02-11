from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CategoryViewSet, OrganizationViewSet, ChapterViewSet, SyncAllChaptersView

router = DefaultRouter()
router.register(r'categories', CategoryViewSet, basename='category')
router.register(r'organizations', OrganizationViewSet, basename='organization')
router.register(r'chapters', ChapterViewSet, basename='chapter')

urlpatterns = [
    path('', include(router.urls)),
    path('sync-all/', SyncAllChaptersView.as_view(), name='sync-all-chapters'),
]
