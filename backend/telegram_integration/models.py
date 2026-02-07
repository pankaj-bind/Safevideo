from django.db import models
from django.contrib.auth.models import User


class TelegramConfig(models.Model):
    """Per-user Telegram API credentials and session."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='telegram_config')
    api_id = models.CharField(max_length=50)
    api_hash = models.CharField(max_length=100)
    phone_number = models.CharField(max_length=30, blank=True, default='')
    session_string = models.TextField(blank=True, default='', help_text='Telethon StringSession')
    is_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} – {'verified' if self.is_verified else 'unverified'}"
