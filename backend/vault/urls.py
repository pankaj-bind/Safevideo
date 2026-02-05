from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CategoryViewSet, OrganizationViewSet

router = DefaultRouter()
router.register(r'categories', CategoryViewSet, basename='category')
router.register(r'organizations', OrganizationViewSet, basename='organization')

urlpatterns = [
    path('', include(router.urls)),
]
