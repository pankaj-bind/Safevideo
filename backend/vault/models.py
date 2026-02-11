from django.db import models
from django.contrib.auth.models import User


class Category(models.Model):
    """Category model for organizing organizations"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='categories')
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = 'Categories'
        ordering = ['-created_at']
        unique_together = ['user', 'name']

    def __str__(self):
        return f"{self.user.username} - {self.name}"


class Organization(models.Model):
    """Organization model for storing credentials"""
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='organizations')
    name = models.CharField(max_length=255)
    logo = models.ImageField(upload_to='organization_logos/', null=True, blank=True)
    credential_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = ['category', 'name']

    def __str__(self):
        return f"{self.category.name} - {self.name}"


class Chapter(models.Model):
    """Chapter model — sits between Organization and Videos"""
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='chapters')
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = ['organization', 'name']

    def __str__(self):
        return f"{self.organization.name} - {self.name}"


class ChapterNote(models.Model):
    """Notes for a chapter — tracks completion status, personal notes, etc."""
    STATUS_CHOICES = [
        ('not_started', 'Not Started'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('revision', 'Needs Revision'),
    ]

    chapter = models.OneToOneField(Chapter, on_delete=models.CASCADE, related_name='note')
    content = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='not_started')
    progress = models.IntegerField(default=0, help_text='Completion percentage 0-100')
    key_points = models.TextField(blank=True, default='', help_text='Key takeaways or important points')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return f"Note: {self.chapter.name} ({self.get_status_display()})"
