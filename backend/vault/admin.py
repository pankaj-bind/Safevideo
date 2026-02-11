from django.contrib import admin
from .models import Category, Organization, Chapter, ChapterNote


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'user', 'created_at', 'updated_at']
    list_filter = ['user', 'created_at']
    search_fields = ['name', 'user__username']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'credential_count', 'created_at', 'updated_at']
    list_filter = ['category', 'created_at']
    search_fields = ['name', 'category__name']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(Chapter)
class ChapterAdmin(admin.ModelAdmin):
    list_display = ['name', 'organization', 'created_at', 'updated_at']
    list_filter = ['organization', 'created_at']
    search_fields = ['name', 'organization__name']


@admin.register(ChapterNote)
class ChapterNoteAdmin(admin.ModelAdmin):
    list_display = ['chapter', 'status', 'progress', 'updated_at']
    list_filter = ['status', 'updated_at']
    search_fields = ['chapter__name', 'content', 'key_points']
    readonly_fields = ['created_at', 'updated_at']
    readonly_fields = ['created_at', 'updated_at']
