"""
Custom JWT Authentication Backend
Extracts tokens from HttpOnly cookies instead of Authorization header
"""
from django.conf import settings
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError


class CookieJWTAuthentication(JWTAuthentication):
    """
    Custom authentication class that reads JWT from HttpOnly cookies.
    This prevents XSS attacks from accessing the tokens.
    """

    def authenticate(self, request):
        """
        Override to extract token from cookie instead of header.
        """
        # Get access token from cookie
        raw_token = request.COOKIES.get(settings.AUTH_COOKIE)
        
        if raw_token is None:
            return None  # No authentication attempted

        try:
            validated_token = self.get_validated_token(raw_token)
            user = self.get_user(validated_token)
            return (user, validated_token)
        except (InvalidToken, TokenError):
            return None  # Invalid token, continue to other auth backends
