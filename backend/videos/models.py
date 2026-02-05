from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()

class Video(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('PROCESSING', 'Processing'),
        ('COMPLETED', 'Completed'),
        ('FAILED', 'Failed'),
        ('CANCELED', 'Canceled'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='videos')
    category = models.ForeignKey('vault.Category', on_delete=models.CASCADE, related_name='videos', null=True, blank=True)
    organization = models.ForeignKey('vault.Organization', on_delete=models.CASCADE, related_name='videos', null=True, blank=True)
    title = models.CharField(max_length=255)
    file_id = models.CharField(max_length=255, blank=True, null=True, help_text="Google Drive File ID")
    folder_path = models.CharField(max_length=500, blank=True, null=True, help_text="Category/Organization path")
    file_size = models.BigIntegerField(null=True, blank=True)
    mime_type = models.CharField(max_length=100, blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    error_message = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.title} ({self.status})"
