from django.contrib import admin
from .models import TelegramConfig


@admin.register(TelegramConfig)
class TelegramConfigAdmin(admin.ModelAdmin):
    list_display = ('user', 'api_id', 'is_verified', 'updated_at')
    list_filter = ('is_verified',)
    readonly_fields = ('session_string',)
