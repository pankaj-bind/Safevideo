"""
Django management command to sync all chapters with Google Drive.

Usage:
    python manage.py sync_all_chapters
    python manage.py sync_all_chapters --user-id=1
    python manage.py sync_all_chapters --username=admin
"""
import logging
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from vault.models import Chapter, Organization
from videos.models import Video, PDFDocument
from videos.services import DriveService

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Sync all chapters with Google Drive for all users or a specific user'

    def add_arguments(self, parser):
        parser.add_argument(
            '--user-id',
            type=int,
            help='Sync only for a specific user by ID',
        )
        parser.add_argument(
            '--username',
            type=str,
            help='Sync only for a specific user by username',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be synced without making changes',
        )

    def handle(self, *args, **options):
        user_id = options.get('user_id')
        username = options.get('username')
        dry_run = options.get('dry_run', False)

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No changes will be made'))

        # Determine which users to sync
        if user_id:
            try:
                users = [User.objects.get(id=user_id)]
                self.stdout.write(f'Syncing for user ID: {user_id}')
            except User.DoesNotExist:
                self.stdout.write(self.style.ERROR(f'User with ID {user_id} not found'))
                return
        elif username:
            try:
                users = [User.objects.get(username=username)]
                self.stdout.write(f'Syncing for username: {username}')
            except User.DoesNotExist:
                self.stdout.write(self.style.ERROR(f'User "{username}" not found'))
                return
        else:
            users = User.objects.all()
            self.stdout.write(f'Syncing for all users ({users.count()} total)')

        total_synced = 0
        total_deleted = 0
        total_pdf_synced = 0
        total_pdf_deleted = 0
        total_chapters = 0

        drive_service = DriveService()

        for user in users:
            self.stdout.write(f'\n{self.style.HTTP_INFO}Processing user: {user.username} (ID: {user.id})')
            
            # Get all chapters for this user
            chapters = Chapter.objects.filter(
                organization__category__user=user
            ).select_related('organization', 'organization__category')

            if not chapters.exists():
                self.stdout.write(f'  No chapters found for user {user.username}')
                continue

            for chapter in chapters:
                total_chapters += 1
                organization = chapter.organization
                category = organization.category

                folder_path = f"{category.name}/{organization.name}/{chapter.name}"
                
                self.stdout.write(f'\n  Syncing: {self.style.WARNING}{folder_path}')

                if dry_run:
                    self.stdout.write(f'    [DRY RUN] Would sync chapter: {chapter.name} (ID: {chapter.id})')
                    continue

                try:
                    result = self._sync_chapter(
                        user=user,
                        organization=organization,
                        chapter=chapter,
                        folder_path=folder_path,
                        drive_service=drive_service
                    )

                    total_synced += result['synced']
                    total_deleted += result['deleted']
                    total_pdf_synced += result['pdf_synced']
                    total_pdf_deleted += result['pdf_deleted']

                    self.stdout.write(
                        f'    ✓ Videos: +{result["synced"]} -{result["deleted"]} | '
                        f'PDFs: +{result["pdf_synced"]} -{result["pdf_deleted"]}'
                    )

                except Exception as e:
                    self.stdout.write(
                        self.style.ERROR(f'    ✗ Error syncing {folder_path}: {str(e)}')
                    )
                    logger.error(f'Error syncing chapter {chapter.id}: {e}', exc_info=True)

        # Print summary
        self.stdout.write(f'\n{self.style.SUCCESS}=== SYNC SUMMARY ===')
        self.stdout.write(f'Chapters processed: {total_chapters}')
        self.stdout.write(f'Videos synced: {total_synced}')
        self.stdout.write(f'Videos deleted: {total_deleted}')
        self.stdout.write(f'PDFs synced: {total_pdf_synced}')
        self.stdout.write(f'PDFs deleted: {total_pdf_deleted}')
        
        if dry_run:
            self.stdout.write(self.style.WARNING('\nThis was a DRY RUN. Run without --dry-run to apply changes.'))

    def _sync_chapter(self, user, organization, chapter, folder_path, drive_service):
        """
        Sync a single chapter with Google Drive.
        Returns a dict with sync statistics.
        """
        synced = 0
        deleted = 0
        pdf_synced = 0
        pdf_deleted = 0

        # =================================================================
        # Phase 1 – Check if the Drive folder still exists
        # =================================================================
        drive_folder_id = drive_service.folder_exists_in_path(folder_path)

        if drive_folder_id is None:
            # Folder deleted from Drive → purge all videos and PDFs
            purge_filter = {
                'organization': organization,
                'chapter': chapter,
                'user': user,
            }

            deleted_qs = Video.objects.filter(**purge_filter)
            deleted = deleted_qs.count()
            deleted_qs.delete()

            deleted_pdf_qs = PDFDocument.objects.filter(**purge_filter)
            pdf_deleted = deleted_pdf_qs.count()
            deleted_pdf_qs.delete()

            return {
                'synced': 0,
                'deleted': deleted,
                'pdf_synced': 0,
                'pdf_deleted': pdf_deleted,
                'total': 0,
            }

        # =================================================================
        # Phase 2 – List current Drive video contents
        # =================================================================
        drive_files = drive_service.list_folder_files(folder_path)
        drive_file_ids = {f.get('id') for f in drive_files if f.get('id')}
        drive_subfolder_ids = {
            f.get('drive_folder_id') for f in drive_files if f.get('drive_folder_id')
        }

        # =================================================================
        # Phase 3 – Remove DB videos whose Drive file no longer exists
        # =================================================================
        existing_filter = {
            'organization': organization,
            'chapter': chapter,
            'user': user,
            'file_id__isnull': False,
        }

        db_videos = Video.objects.filter(**existing_filter)

        for video in db_videos:
            still_on_drive = False

            if video.file_id and video.file_id in drive_file_ids:
                still_on_drive = True
            elif video.drive_folder_id and video.drive_folder_id in drive_subfolder_ids:
                still_on_drive = True

            if not still_on_drive:
                # Double-check via Drive API
                if video.drive_folder_id:
                    still_on_drive = drive_service.file_exists(video.drive_folder_id)
                elif video.file_id:
                    still_on_drive = drive_service.file_exists(video.file_id)

            if not still_on_drive:
                logger.info(f"Sync: removing video {video.id} '{video.title}' — no longer on Drive")
                video.delete()
                deleted += 1

        # =================================================================
        # Phase 4 – Import new videos from Drive → DB
        # =================================================================
        remaining_file_ids = set(
            Video.objects.filter(**existing_filter).values_list('file_id', flat=True)
        )

        for drive_file in drive_files:
            file_id = drive_file.get('id')
            if file_id in remaining_file_ids:
                continue

            # Extract duration from videoMediaMetadata
            drive_duration = None
            vmm = drive_file.get('videoMediaMetadata')
            if vmm and vmm.get('durationMillis'):
                try:
                    drive_duration = int(vmm['durationMillis']) / 1000.0
                except (ValueError, TypeError):
                    pass

            Video.objects.create(
                user=user,
                title=drive_file.get('name', 'Untitled'),
                file_id=file_id,
                status='COMPLETED',
                organization=organization,
                chapter=chapter,
                category=organization.category,
                folder_path=folder_path,
                file_size=int(drive_file.get('size', 0)),
                mime_type=drive_file.get('mimeType', ''),
                drive_folder_id=drive_file.get('drive_folder_id'),
                thumbnail=drive_file.get('thumbnail_id'),
                preview=drive_file.get('preview_id'),
                duration=drive_duration,
            )
            synced += 1

        # =================================================================
        # Phase 5 – Sync PDFs (separate Drive listing)
        # =================================================================
        try:
            drive_pdfs = drive_service.list_folder_pdfs(folder_path)
            drive_pdf_file_ids = {f.get('id') for f in drive_pdfs if f.get('id')}
            drive_pdf_subfolder_ids = {
                f.get('drive_folder_id') for f in drive_pdfs if f.get('drive_folder_id')
            }

            pdf_filter = {
                'organization': organization,
                'chapter': chapter,
                'user': user,
                'file_id__isnull': False,
            }

            # Remove stale PDFs
            db_pdfs = PDFDocument.objects.filter(**pdf_filter)
            for pdf in db_pdfs:
                still_on_drive = False
                if pdf.file_id and pdf.file_id in drive_pdf_file_ids:
                    still_on_drive = True
                elif pdf.drive_folder_id and pdf.drive_folder_id in drive_pdf_subfolder_ids:
                    still_on_drive = True

                if not still_on_drive:
                    if pdf.drive_folder_id:
                        still_on_drive = drive_service.file_exists(pdf.drive_folder_id)
                    elif pdf.file_id:
                        still_on_drive = drive_service.file_exists(pdf.file_id)

                if not still_on_drive:
                    logger.info(f"Sync: removing PDF {pdf.id} '{pdf.title}' — no longer on Drive")
                    pdf.delete()
                    pdf_deleted += 1

            # Import new PDFs
            remaining_pdf_file_ids = set(
                PDFDocument.objects.filter(**pdf_filter).values_list('file_id', flat=True)
            )

            for drive_pdf in drive_pdfs:
                file_id = drive_pdf.get('id')
                if file_id in remaining_pdf_file_ids:
                    continue

                PDFDocument.objects.create(
                    user=user,
                    title=drive_pdf.get('name', 'Untitled.pdf'),
                    file_id=file_id,
                    drive_folder_id=drive_pdf.get('drive_folder_id'),
                    file_size=int(drive_pdf.get('size', 0)),
                    folder_path=folder_path,
                    organization=organization,
                    chapter=chapter,
                    category=organization.category,
                )
                pdf_synced += 1

        except Exception as e:
            logger.warning(f"PDF sync phase failed for {folder_path}: {e}")

        return {
            'synced': synced,
            'deleted': deleted,
            'pdf_synced': pdf_synced,
            'pdf_deleted': pdf_deleted,
            'total': synced + pdf_synced,
        }
