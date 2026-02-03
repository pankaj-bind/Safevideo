from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


# =============================================================================
# HIERARCHY MODELS: Vault > Subject > Chapter > Video
# =============================================================================

class Vault(models.Model):
    """
    Top-level container for organizing content (e.g., GATE, SDE, Private).
    Each vault belongs to a user and contains subjects.
    """
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='vaults')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    icon = models.CharField(max_length=100, blank=True, default='folder', 
                           help_text="Icon identifier (e.g., 'folder', 'book', 'code')")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = ['user', 'title']

    def __str__(self):
        return f"{self.title} ({self.user.username})"


class Subject(models.Model):
    """
    Second-level container within a Vault (e.g., Digital Logic, DSA).
    """
    vault = models.ForeignKey(Vault, on_delete=models.CASCADE, related_name='subjects')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    order = models.PositiveIntegerField(default=0, help_text="Display order within vault")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', 'created_at']
        unique_together = ['vault', 'title']

    def __str__(self):
        return f"{self.vault.title} > {self.title}"


class Chapter(models.Model):
    """
    Third-level container within a Subject (e.g., Arrays, Boolean Algebra).
    Contains the actual video content.
    """
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='chapters')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    order = models.PositiveIntegerField(default=0, help_text="Display order within subject")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', 'created_at']
        unique_together = ['subject', 'title']

    def __str__(self):
        return f"{self.subject.vault.title} > {self.subject.title} > {self.title}"


# =============================================================================
# VIDEO MODEL (Refactored)
# =============================================================================

class Video(models.Model):
    """
    Video content - either uploaded to Google Drive or linked from YouTube.
    Belongs to a Chapter in the hierarchy.
    """
    VIDEO_TYPE_CHOICES = [
        ('UPLOAD', 'Uploaded File'),
        ('YOUTUBE', 'YouTube Link'),
    ]
    
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('PROCESSING', 'Processing'),
        ('COMPLETED', 'Completed'),
        ('FAILED', 'Failed'),
    ]

    # Hierarchy relationship
    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE, related_name='videos',
                                null=True, blank=True, help_text="Chapter this video belongs to")
    
    # Legacy: Direct user relationship for backward compatibility
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='videos')
    
    # Core fields
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    
    # Video source type
    video_type = models.CharField(max_length=20, choices=VIDEO_TYPE_CHOICES, default='UPLOAD')
    
    # For UPLOAD type: Google Drive file ID
    file_id = models.CharField(max_length=255, blank=True, null=True, 
                               help_text="Google Drive File ID for uploaded videos")
    
    # For YOUTUBE type: YouTube URL
    youtube_url = models.URLField(max_length=500, blank=True, default='',
                                  help_text="YouTube video URL")
    
    # Processing status
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    error_message = models.TextField(blank=True, null=True)
    
    # Ordering within chapter
    order = models.PositiveIntegerField(default=0, help_text="Display order within chapter")
    
    # Duration in seconds (optional, for display purposes)
    duration = models.PositiveIntegerField(null=True, blank=True, help_text="Video duration in seconds")
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', 'created_at']

    def __str__(self):
        return f"{self.title} ({self.video_type} - {self.status})"
    
    @property
    def is_playable(self):
        """Check if video can be played."""
        if self.video_type == 'YOUTUBE':
            return bool(self.youtube_url)
        return self.status == 'COMPLETED' and bool(self.file_id)
