from django.db.models import Count
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from .models import Category, Organization
from .serializers import (
    CategorySerializer, 
    CategoryCreateSerializer,
    OrganizationSerializer,
    OrganizationCreateSerializer
)


class CategoryViewSet(viewsets.ModelViewSet):
    """ViewSet for Category CRUD operations"""
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        from django.db.models import Prefetch
        return Category.objects.filter(user=self.request.user).prefetch_related(
            Prefetch(
                'organizations',
                queryset=Organization.objects.annotate(video_count=Count('videos'))
            )
        )
    
    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return CategoryCreateSerializer
        return CategorySerializer
    
    def perform_create(self, serializer):
        serializer.save()
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.user != request.user:
            return Response(
                {"error": "You don't have permission to delete this category."},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().destroy(request, *args, **kwargs)


class OrganizationViewSet(viewsets.ModelViewSet):
    """ViewSet for Organization CRUD operations"""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    
    def get_queryset(self):
        return Organization.objects.filter(
            category__user=self.request.user
        ).annotate(video_count=Count('videos'))
    
    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return OrganizationCreateSerializer
        return OrganizationSerializer
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.category.user != request.user:
            return Response(
                {"error": "You don't have permission to delete this organization."},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().destroy(request, *args, **kwargs)
    
    @action(detail=True, methods=['post'])
    def upload_logo(self, request, pk=None):
        """Upload or update organization logo"""
        organization = self.get_object()
        
        if organization.category.user != request.user:
            return Response(
                {"error": "You don't have permission to modify this organization."},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if 'logo' not in request.FILES:
            return Response(
                {"error": "No logo file provided."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Delete old logo if exists
        if organization.logo:
            organization.logo.delete()
        
        organization.logo = request.FILES['logo']
        organization.save()
        
        serializer = self.get_serializer(organization, context={'request': request})
        return Response(serializer.data)
    
    @action(detail=True, methods=['delete'])
    def remove_logo(self, request, pk=None):
        """Remove organization logo"""
        organization = self.get_object()
        
        if organization.category.user != request.user:
            return Response(
                {"error": "You don't have permission to modify this organization."},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if organization.logo:
            organization.logo.delete()
            organization.save()
        
        serializer = self.get_serializer(organization, context={'request': request})
        return Response(serializer.data)
