"""
Core URL Configuration
API routing with versioned endpoints
"""
from django.contrib import admin
from django.urls import path, include
from authentication.urls import dashboard_urlpatterns

urlpatterns = [
    path('admin/', admin.site.urls),
    
    # API v1 endpoints
    path('api/auth/', include('authentication.urls', namespace='auth')),
    path('api/videos/', include('videos.urls')),
    path('api/dashboard/', include(dashboard_urlpatterns)),
]
