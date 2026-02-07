import logging

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from .models import TelegramConfig
from .serializers import (
    TelegramConfigSerializer,
    SendOtpSerializer,
    VerifyOtpSerializer,
    TelegramDownloadSerializer,
)
from . import services

logger = logging.getLogger(__name__)


class TelegramConfigView(APIView):
    """GET / POST  Telegram API credentials."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            config = TelegramConfig.objects.get(user=request.user)
            return Response({
                'api_id': config.api_id,
                'api_hash': config.api_hash,
                'phone_number': config.phone_number,
                'is_verified': config.is_verified,
            })
        except TelegramConfig.DoesNotExist:
            return Response({'api_id': '', 'api_hash': '', 'phone_number': '',
                             'is_verified': False})

    def post(self, request):
        serializer = TelegramConfigSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        config, _ = TelegramConfig.objects.update_or_create(
            user=request.user,
            defaults={
                'api_id': serializer.validated_data['api_id'],
                'api_hash': serializer.validated_data['api_hash'],
            },
        )
        return Response({
            'api_id': config.api_id,
            'api_hash': config.api_hash,
            'phone_number': config.phone_number,
            'is_verified': config.is_verified,
        })


class SendOtpView(APIView):
    """Send OTP to the user's Telegram phone number."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = SendOtpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            phone_hash = services.send_otp(
                request.user,
                serializer.validated_data['phone_number'],
            )
            return Response({'phone_hash': phone_hash, 'message': 'OTP sent.'})
        except Exception as e:
            return Response({'error': str(e)},
                            status=status.HTTP_400_BAD_REQUEST)


class VerifyOtpView(APIView):
    """Verify OTP code and persist the Telegram session."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = VerifyOtpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            services.verify_otp(
                request.user,
                serializer.validated_data['otp'],
                serializer.validated_data['phone_hash'],
            )
            return Response({'message': 'Verified successfully.',
                             'is_verified': True})
        except Exception as e:
            return Response({'error': str(e)},
                            status=status.HTTP_400_BAD_REQUEST)


class GroupMediaView(APIView):
    """List all media in a Telegram group."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        group_id = request.query_params.get('group_id')
        if not group_id:
            return Response({'error': 'group_id required.'},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            logger.info(f"Fetching media for group {group_id} (user={request.user})")
            media = services.fetch_group_media(request.user, group_id)
            logger.info(f"Found {len(media)} media items in group {group_id}")
            return Response({'media': media, 'count': len(media)})
        except Exception as e:
            logger.error(f"GroupMedia error for {group_id}: {e}", exc_info=True)
            return Response({'error': str(e)},
                            status=status.HTTP_400_BAD_REQUEST)


class TelegramDownloadView(APIView):
    """Download selected media from Telegram, process, upload to Drive."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = TelegramDownloadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            video_ids = services.download_and_upload(
                user=request.user,
                group_id=serializer.validated_data['group_id'],
                message_ids=serializer.validated_data['message_ids'],
                organization_id=serializer.validated_data['organization_id'],
                category_id=serializer.validated_data['category_id'],
                media_info=serializer.validated_data.get('media_info'),
            )
            return Response({'video_ids': video_ids,
                             'message': 'Download started.'})
        except Exception as e:
            return Response({'error': str(e)},
                            status=status.HTTP_400_BAD_REQUEST)


class CancelDownloadView(APIView):
    """Cancel one or more in-progress Telegram downloads."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        video_ids = request.data.get('video_ids', [])
        if not video_ids or not isinstance(video_ids, list):
            return Response({'error': 'video_ids list required.'},
                            status=status.HTTP_400_BAD_REQUEST)
        count = services.cancel_downloads(video_ids)
        return Response({'cancelled': count, 'message': f'{count} download(s) cancelled.'})


class DownloadStatusView(APIView):
    """Return download speeds for active downloads."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        video_ids = request.data.get('video_ids', [])
        if not video_ids or not isinstance(video_ids, list):
            return Response({'error': 'video_ids list required.'},
                            status=status.HTTP_400_BAD_REQUEST)
        speeds = services.get_download_speeds(video_ids)
        return Response({'speeds': speeds})
