"""
Authentication Services Layer
Clean separation of business logic from views
"""
from typing import Tuple, Optional
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from django.db import IntegrityError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken
from rest_framework_simplejwt.exceptions import TokenError

from .exceptions import (
    UserAlreadyExistsError,
    InvalidCredentialsError,
    TokenRefreshError,
)


class AuthService:
    """
    Service class handling all authentication business logic.
    Views delegate to this service for clean separation of concerns.
    """

    @staticmethod
    def create_user(email: str, username: str, password: str) -> User:
        """
        Create a new user with proper password hashing.
        
        Args:
            email: User's email address
            username: Unique username
            password: Plain text password (will be hashed)
            
        Returns:
            Created User instance
            
        Raises:
            UserAlreadyExistsError: If username or email already exists
        """
        # Check for existing user
        if User.objects.filter(username=username).exists():
            raise UserAlreadyExistsError("Username already taken")
        
        if User.objects.filter(email=email).exists():
            raise UserAlreadyExistsError("Email already registered")

        try:
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password,  # create_user handles hashing
            )
            return user
        except IntegrityError as e:
            raise UserAlreadyExistsError("User creation failed") from e

    @staticmethod
    def authenticate_user(email: str, password: str) -> User:
        """
        Authenticate user with email and password.
        
        Args:
            email: User's email
            password: Plain text password
            
        Returns:
            Authenticated User instance
            
        Raises:
            InvalidCredentialsError: If credentials are invalid
        """
        # Get user by email first
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            raise InvalidCredentialsError("Invalid email or password")

        # Authenticate with username (Django default)
        authenticated_user = authenticate(
            username=user.username,
            password=password
        )
        
        if authenticated_user is None:
            raise InvalidCredentialsError("Invalid email or password")
        
        if not authenticated_user.is_active:
            raise InvalidCredentialsError("Account is disabled")
            
        return authenticated_user

    @staticmethod
    def generate_tokens(user: User) -> Tuple[str, str]:
        """
        Generate JWT token pair for authenticated user.
        
        Args:
            user: Authenticated User instance
            
        Returns:
            Tuple of (access_token, refresh_token)
        """
        refresh = RefreshToken.for_user(user)
        return str(refresh.access_token), str(refresh)

    @staticmethod
    def refresh_access_token(refresh_token: str) -> Tuple[str, str]:
        """
        Generate new token pair from refresh token.
        Implements token rotation for enhanced security.
        
        Args:
            refresh_token: Valid refresh token
            
        Returns:
            Tuple of (new_access_token, new_refresh_token)
            
        Raises:
            TokenRefreshError: If refresh token is invalid or blacklisted
        """
        try:
            refresh = RefreshToken(refresh_token)
            # Generate new access token
            access_token = str(refresh.access_token)
            # Rotate refresh token (blacklists old one if configured)
            new_refresh = str(refresh)
            return access_token, new_refresh
        except TokenError as e:
            raise TokenRefreshError("Invalid or expired refresh token") from e

    @staticmethod
    def blacklist_token(refresh_token: str) -> None:
        """
        Blacklist refresh token on logout.
        
        Args:
            refresh_token: Token to blacklist
        """
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except TokenError:
            # Token already invalid/blacklisted - continue silently
            pass

    @staticmethod
    def blacklist_all_user_tokens(user: User) -> None:
        """
        Blacklist all refresh tokens for a user (logout from all devices).
        
        Args:
            user: User whose tokens should be blacklisted
        """
        outstanding_tokens = OutstandingToken.objects.filter(user=user)
        for token in outstanding_tokens:
            try:
                BlacklistedToken.objects.get_or_create(token=token)
            except Exception:
                continue
