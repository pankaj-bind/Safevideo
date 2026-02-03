"""
Authentication Selectors Layer
Read-only queries for user data
"""
from typing import Dict, Any, Optional
from django.contrib.auth.models import User


class UserSelector:
    """
    Selector class for user-related queries.
    All read operations are centralized here.
    """

    @staticmethod
    def get_user_by_id(user_id: int) -> Optional[User]:
        """Fetch user by primary key."""
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None

    @staticmethod
    def get_user_by_email(email: str) -> Optional[User]:
        """Fetch user by email address."""
        try:
            return User.objects.get(email=email)
        except User.DoesNotExist:
            return None

    @staticmethod
    def get_user_profile(user: User) -> Dict[str, Any]:
        """
        Get serialized user profile data for API response.
        
        Args:
            user: User instance
            
        Returns:
            Dictionary with user profile data
        """
        return {
            'id': user.id,
            'email': user.email,
            'username': user.username,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'date_joined': user.date_joined.isoformat(),
            'is_active': user.is_active,
        }

    @staticmethod
    def get_user_dashboard_data(user: User) -> Dict[str, Any]:
        """
        Get user data for dashboard display.
        Extend this with additional user-related data.
        
        Args:
            user: Authenticated User instance
            
        Returns:
            Dashboard data dictionary
        """
        return {
            'user': UserSelector.get_user_profile(user),
            'permissions': list(user.get_all_permissions()),
            'groups': list(user.groups.values_list('name', flat=True)),
        }
