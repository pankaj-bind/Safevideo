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
