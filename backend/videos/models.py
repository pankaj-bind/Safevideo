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
    chapter = models.ForeignKey('vault.Chapter', on_delete=models.CASCADE, related_name='videos', null=True, blank=True)
    title = models.CharField(max_length=255)
    file_id = models.CharField(max_length=255, blank=True, null=True, help_text="Google Drive File ID")
    drive_folder_id = models.CharField(max_length=255, blank=True, null=True, help_text="Google Drive Folder ID containing video assets")
    folder_path = models.CharField(max_length=500, blank=True, null=True, help_text="Category/Organization path")
    file_size = models.BigIntegerField(null=True, blank=True)
    mime_type = models.CharField(max_length=100, blank=True, null=True)
    duration = models.FloatField(null=True, blank=True, help_text="Video duration in seconds")
    thumbnail = models.CharField(max_length=255, blank=True, null=True, help_text="Google Drive File ID for thumbnail")
    preview = models.CharField(max_length=255, blank=True, null=True, help_text="Google Drive File ID for preview clip")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    progress = models.IntegerField(default=0, help_text="Processing progress percentage 0-100")
    error_message = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.title} ({self.status})"


class PDFDocument(models.Model):
    """PDF file stored on Google Drive, belonging to an organization/chapter."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='pdfs')
    category = models.ForeignKey('vault.Category', on_delete=models.CASCADE, related_name='pdfs', null=True, blank=True)
    organization = models.ForeignKey('vault.Organization', on_delete=models.CASCADE, related_name='pdfs', null=True, blank=True)
    chapter = models.ForeignKey('vault.Chapter', on_delete=models.CASCADE, related_name='pdfs', null=True, blank=True)
    title = models.CharField(max_length=255)
    file_id = models.CharField(max_length=255, blank=True, null=True, help_text="Google Drive File ID")
    drive_folder_id = models.CharField(max_length=255, blank=True, null=True, help_text="Google Drive Folder ID")
    folder_path = models.CharField(max_length=500, blank=True, null=True)
    file_size = models.BigIntegerField(null=True, blank=True)
    page_count = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title


class PDFAnnotation(models.Model):
    """Annotation on a PDF page — highlights, notes, drawings, shapes, text."""
    ANNOTATION_TYPES = [
        ('highlight', 'Highlight'),
        ('note', 'Sticky Note'),
        ('drawing', 'Freehand Drawing'),
        ('text', 'Text'),
        ('shape', 'Shape'),
    ]

    pdf = models.ForeignKey(PDFDocument, on_delete=models.CASCADE, related_name='annotations')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='pdf_annotations')
    page = models.IntegerField(help_text="1-based page number")
    annotation_type = models.CharField(max_length=20, choices=ANNOTATION_TYPES)
    data = models.JSONField(help_text="Annotation data (position, text, color, paths, etc.)")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['page', 'created_at']

    def __str__(self):
        return f"{self.annotation_type} on page {self.page} of {self.pdf.title}"
