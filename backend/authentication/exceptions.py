"""
Custom Exception Classes and Handler
Centralized error handling for authentication
"""
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status


class AuthenticationError(Exception):
    """Base authentication exception."""
    default_message = "Authentication error occurred"
    status_code = status.HTTP_400_BAD_REQUEST

    def __init__(self, message: str = None):
        self.message = message or self.default_message
        super().__init__(self.message)


class UserAlreadyExistsError(AuthenticationError):
    """Raised when attempting to create a user that already exists."""
    default_message = "User already exists"
    status_code = status.HTTP_409_CONFLICT


class InvalidCredentialsError(AuthenticationError):
    """Raised when login credentials are invalid."""
    default_message = "Invalid credentials"
    status_code = status.HTTP_401_UNAUTHORIZED


class TokenRefreshError(AuthenticationError):
    """Raised when token refresh fails."""
    default_message = "Token refresh failed"
    status_code = status.HTTP_401_UNAUTHORIZED


def custom_exception_handler(exc, context):
    """
    Custom exception handler that provides consistent error response format.
    """
    # Handle our custom authentication exceptions
    if isinstance(exc, AuthenticationError):
        return Response(
            {
                'success': False,
                'error': {
                    'type': exc.__class__.__name__,
                    'message': exc.message,
                }
            },
            status=exc.status_code
        )

    # Call DRF's default exception handler for other exceptions
    response = exception_handler(exc, context)

    if response is not None:
        # Normalize the response format
        response.data = {
            'success': False,
            'error': {
                'type': exc.__class__.__name__,
                'message': response.data.get('detail', str(response.data)),
            }
        }

    return response
