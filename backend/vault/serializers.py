from rest_framework import serializers
from .models import Category, Organization


class OrganizationSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = ['id', 'name', 'logo', 'logo_url', 'credential_count', 'created_at', 'updated_at']
        read_only_fields = ['credential_count', 'created_at', 'updated_at']

    def get_logo_url(self, obj):
        if obj.logo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.logo.url)
        return None


class CategorySerializer(serializers.ModelSerializer):
    organizations = OrganizationSerializer(many=True, read_only=True)
    organization_count = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ['id', 'name', 'organizations', 'organization_count', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']

    def get_organization_count(self, obj):
        return obj.organizations.count()


class CategoryCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['name']

    def validate_name(self, value):
        user = self.context['request'].user
        if Category.objects.filter(user=user, name=value).exists():
            raise serializers.ValidationError("A category with this name already exists.")
        return value

    def create(self, validated_data):
        user = self.context['request'].user
        return Category.objects.create(user=user, **validated_data)


class OrganizationCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ['category', 'name', 'logo']

    def validate(self, data):
        category = data.get('category')
        name = data.get('name')
        
        # Check if user owns the category
        user = self.context['request'].user
        if category.user != user:
            raise serializers.ValidationError("You don't have permission to add organizations to this category.")
        
        # Check for duplicate organization name in the same category
        if Organization.objects.filter(category=category, name=name).exists():
            raise serializers.ValidationError("An organization with this name already exists in this category.")
        
        return data
