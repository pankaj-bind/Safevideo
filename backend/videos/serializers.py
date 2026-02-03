"""
Serializers for the Hierarchical Content Vault
Vault > Subject > Chapter > Video
"""
from rest_framework import serializers
from .models import Vault, Subject, Chapter, Video


# =============================================================================
# VIDEO SERIALIZERS
# =============================================================================

class VideoSerializer(serializers.ModelSerializer):
    """Standard Video serializer with all fields."""
    is_playable = serializers.ReadOnlyField()
    
    class Meta:
        model = Video
        fields = [
            'id', 'title', 'description', 'video_type', 'file_id', 
            'youtube_url', 'status', 'error_message', 'order', 
            'duration', 'is_playable', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'status', 'error_message', 'created_at', 'updated_at']


class VideoCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating videos - handles both upload and YouTube types."""
    
    class Meta:
        model = Video
        fields = [
            'id', 'chapter', 'title', 'description', 'video_type',
            'youtube_url', 'order'
        ]
    
    def validate(self, attrs):
        video_type = attrs.get('video_type', 'UPLOAD')
        youtube_url = attrs.get('youtube_url', '')
        
        if video_type == 'YOUTUBE' and not youtube_url:
            raise serializers.ValidationError({
                'youtube_url': 'YouTube URL is required for YouTube video type.'
            })
        
        return attrs
    
    def create(self, validated_data):
        # Set user from request context
        validated_data['user'] = self.context['request'].user
        
        # For YouTube videos, mark as completed immediately
        if validated_data.get('video_type') == 'YOUTUBE':
            validated_data['status'] = 'COMPLETED'
        
        return super().create(validated_data)


# =============================================================================
# CHAPTER SERIALIZERS
# =============================================================================

class ChapterSerializer(serializers.ModelSerializer):
    """Standard Chapter serializer."""
    video_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Chapter
        fields = [
            'id', 'subject', 'title', 'description', 'order',
            'video_count', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_video_count(self, obj):
        return obj.videos.count()


class ChapterDetailSerializer(serializers.ModelSerializer):
    """Chapter serializer with nested videos for the player view."""
    videos = VideoSerializer(many=True, read_only=True)
    subject_title = serializers.CharField(source='subject.title', read_only=True)
    vault_title = serializers.CharField(source='subject.vault.title', read_only=True)
    vault_id = serializers.IntegerField(source='subject.vault.id', read_only=True)
    
    class Meta:
        model = Chapter
        fields = [
            'id', 'subject', 'subject_title', 'vault_id', 'vault_title',
            'title', 'description', 'order', 'videos', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


# =============================================================================
# SUBJECT SERIALIZERS
# =============================================================================

class SubjectSerializer(serializers.ModelSerializer):
    """Standard Subject serializer."""
    chapter_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Subject
        fields = [
            'id', 'vault', 'title', 'description', 'order',
            'chapter_count', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_chapter_count(self, obj):
        return obj.chapters.count()


class SubjectDetailSerializer(serializers.ModelSerializer):
    """Subject serializer with nested chapters."""
    chapters = ChapterSerializer(many=True, read_only=True)
    vault_title = serializers.CharField(source='vault.title', read_only=True)
    
    class Meta:
        model = Subject
        fields = [
            'id', 'vault', 'vault_title', 'title', 'description', 
            'order', 'chapters', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


# =============================================================================
# VAULT SERIALIZERS
# =============================================================================

class VaultSerializer(serializers.ModelSerializer):
    """Standard Vault serializer."""
    subject_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Vault
        fields = [
            'id', 'title', 'description', 'icon', 
            'subject_count', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_subject_count(self, obj):
        return obj.subjects.count()
    
    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)


class VaultDetailSerializer(serializers.ModelSerializer):
    """Vault serializer with nested subjects (for optional eager loading)."""
    subjects = SubjectSerializer(many=True, read_only=True)
    
    class Meta:
        model = Vault
        fields = [
            'id', 'title', 'description', 'icon',
            'subjects', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


# =============================================================================
# BREADCRUMB SERIALIZER
# =============================================================================

class BreadcrumbSerializer(serializers.Serializer):
    """Serializer for breadcrumb navigation data."""
    vault = serializers.SerializerMethodField()
    subject = serializers.SerializerMethodField()
    chapter = serializers.SerializerMethodField()
    
    def get_vault(self, obj):
        if hasattr(obj, 'vault'):
            vault = obj.vault if isinstance(obj, Subject) else obj.subject.vault
        elif hasattr(obj, 'subject'):
            vault = obj.subject.vault
        else:
            vault = obj
        return {'id': vault.id, 'title': vault.title} if vault else None
    
    def get_subject(self, obj):
        if isinstance(obj, Chapter):
            return {'id': obj.subject.id, 'title': obj.subject.title}
        elif isinstance(obj, Subject):
            return {'id': obj.id, 'title': obj.title}
        return None
    
    def get_chapter(self, obj):
        if isinstance(obj, Chapter):
            return {'id': obj.id, 'title': obj.title}
        return None
