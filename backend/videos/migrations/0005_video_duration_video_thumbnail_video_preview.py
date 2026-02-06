from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('videos', '0004_video_progress'),
    ]

    operations = [
        migrations.AddField(
            model_name='video',
            name='duration',
            field=models.FloatField(blank=True, help_text='Video duration in seconds', null=True),
        ),
        migrations.AddField(
            model_name='video',
            name='thumbnail',
            field=models.ImageField(blank=True, help_text='Auto-generated thumbnail from video', null=True, upload_to='thumbnails/'),
        ),
        migrations.AddField(
            model_name='video',
            name='preview',
            field=models.FileField(blank=True, help_text='Auto-generated short preview clip', null=True, upload_to='previews/'),
        ),
    ]
