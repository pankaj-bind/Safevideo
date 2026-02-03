"""
Authentication URL Configuration
All auth endpoints under /api/auth/
"""
from django.urls import path
from .views import (
    SignupView,
    LoginView,
    LogoutView,
    TokenRefreshView,
    MeView,
    DashboardView,
)

app_name = 'authentication'

urlpatterns = [
    # Authentication endpoints
    path('signup/', SignupView.as_view(), name='signup'),
    path('login/', LoginView.as_view(), name='login'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('me/', MeView.as_view(), name='me'),
]

# Dashboard endpoint (separate namespace in production)
dashboard_urlpatterns = [
    path('', DashboardView.as_view(), name='dashboard'),
]
