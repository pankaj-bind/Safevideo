from rest_framework import serializers


class TelegramConfigSerializer(serializers.Serializer):
    api_id = serializers.CharField(max_length=50)
    api_hash = serializers.CharField(max_length=100)


class SendOtpSerializer(serializers.Serializer):
    phone_number = serializers.CharField(max_length=30)


class VerifyOtpSerializer(serializers.Serializer):
    otp = serializers.CharField(max_length=10)
    phone_hash = serializers.CharField(max_length=200)


class TelegramDownloadSerializer(serializers.Serializer):
    group_id = serializers.CharField(max_length=100)
    message_ids = serializers.ListField(child=serializers.IntegerField())
    organization_id = serializers.IntegerField()
    category_id = serializers.IntegerField()
    # Maps str(msg_id) -> {name, size_bytes, mime_type} from the browse step
    media_info = serializers.DictField(child=serializers.DictField(), required=False, default=dict)
