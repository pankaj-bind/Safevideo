from django.apps import AppConfig

class VideosConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'videos'

    def ready(self):
        """
        On server startup, find any videos that are stuck in 'PROCESSING'
        and mark them as 'FAILED'. This prevents the 'Processing forever' bug.
        """
        try:
            from .models import Video
            # Update any video that claims to be processing but isn't running anymore
            count = Video.objects.filter(status='PROCESSING').update(
                status='FAILED',
                error_message='System restart: Processing interrupted'
            )
            if count > 0:
                print(f"⚠️  Reset {count} stuck videos to FAILED state.")
        except Exception:
            # DB might not be ready yet during migration
            pass
