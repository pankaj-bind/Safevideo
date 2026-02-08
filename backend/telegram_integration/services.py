"""
Telegram Integration Services
─────────────────────────────
Handles Telegram client connections, OTP verification, media scanning,
and downloading files from Telegram groups.

Download approach:
  Uses Telethon's built-in client.download_media() — the same single-
  connection method that download.py ultimately delegates to.  This is
  proven reliable at 5-6 MB/s on free Telegram accounts.
  Multiple files are downloaded simultaneously (SIMULTANEOUS_FILES)
  via asyncio.gather + semaphore.

Key design decisions:
  · Always use _run_async() to bridge sync Django → async Telethon.
  · client.connect() for authenticated sessions (NOT client.start()).
  · StringSession for portable, DB-storable session persistence.
  · Videos → ffmpeg 2× speed pipeline (start_background_processing).
  · Non-videos → upload directly to Google Drive as-is.
"""
import os
import re
import asyncio
import logging
import mimetypes
import tempfile
import time as _time
import threading
from concurrent.futures import ThreadPoolExecutor

from django.conf import settings
from django.db import close_old_connections

from telethon import TelegramClient
from telethon.sessions import StringSession

from .models import TelegramConfig

logger = logging.getLogger(__name__)

# ── Download tuning ──────────────────────────────────────────────────────
TELEGRAM_EXECUTOR = ThreadPoolExecutor(max_workers=3)
_DB_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix='tg-db')
SIMULTANEOUS_FILES = 3          # download N files at once

# Temp dir for downloads
DOWNLOAD_TEMP_DIR = os.path.join(tempfile.gettempdir(), 'telegram_downloads')

# In-memory store for pending OTP sessions  {user_id: {client, loop, thread}}
_pending_clients = {}
_pending_clients_lock = threading.Lock()

# Progress throttle cache  {video_id: (last_pct, last_time)}
_progress_cache = {}
_progress_cache_lock = threading.Lock()
# Cancel tracking:  set of video_ids that should be aborted
_cancelled_ids: set = set()
_cancelled_lock = threading.Lock()

# Speed tracking:  {video_id: {'speed_mbps': float, 'last_bytes': int, 'last_time': float}}
_speed_data: dict = {}
_speed_lock = threading.Lock()
# Strip leading numbering from filenames like "1189) ", "003. "
_LEADING_NUMBER_RE = re.compile(r'^\d{1,5}[\)\.\_\-\]\s]+\s*')


# =========================================================================
# Utilities
# =========================================================================

def _run_async(coro):
    """Run an async coroutine from synchronous Django code."""
    result = [None]
    exception = [None]

    def _thread_target():
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                result[0] = loop.run_until_complete(coro)
            finally:
                loop.close()
        except Exception as e:
            exception[0] = e

    t = threading.Thread(target=_thread_target)
    t.start()
    t.join(timeout=300)

    if exception[0]:
        raise exception[0]
    return result[0]


def _build_client(config: TelegramConfig) -> TelegramClient:
    session = StringSession(config.session_string or '')
    return TelegramClient(session, int(config.api_id), config.api_hash)


def _clean_display_name(raw_name: str) -> str:
    """Strip leading numbering prefixes from Telegram filenames."""
    cleaned = _LEADING_NUMBER_RE.sub('', raw_name)
    return cleaned if cleaned else raw_name


def _ensure_dirs():
    os.makedirs(DOWNLOAD_TEMP_DIR, exist_ok=True)


def _update_video_progress(video_id, progress, status_val=None, **extra_fields):
    """Throttled DB progress update (SYNC only — never call from async)."""
    progress = min(progress, 100)

    if not status_val and not extra_fields:
        with _progress_cache_lock:
            prev = _progress_cache.get(video_id)
            now = _time.monotonic()
            if prev:
                prev_pct, prev_t = prev
                if abs(progress - prev_pct) < 3 and (now - prev_t) < 1.0:
                    return
            _progress_cache[video_id] = (progress, now)

    try:
        close_old_connections()
        updates = {'progress': progress}
        if status_val:
            updates['status'] = status_val
        updates.update(extra_fields)
        from videos.models import Video
        Video.objects.filter(id=video_id).update(**updates)
    except Exception as e:
        logger.warning(f"Progress update failed for video {video_id}: {e}")


def _submit_progress(video_id, progress, status_val=None, **extra_fields):
    """Fire-and-forget progress update safe to call from async contexts."""
    _DB_EXECUTOR.submit(_update_video_progress, video_id, progress, status_val, **extra_fields)


def _db_update_video(video_id, **fields):
    """Sync helper — update a Video row (call from executor only)."""
    try:
        close_old_connections()
        from videos.models import Video
        Video.objects.filter(id=video_id).update(**fields)
    except Exception as e:
        logger.warning(f"DB update failed for video {video_id}: {e}")


def _is_cancelled(video_id):
    """Check if a video download has been cancelled."""
    with _cancelled_lock:
        return video_id in _cancelled_ids


def cancel_downloads(video_ids):
    """Mark video IDs for cancellation. Returns how many were marked."""
    from videos.models import Video
    count = 0
    with _cancelled_lock:
        for vid in video_ids:
            _cancelled_ids.add(vid)
            count += 1
    # Update DB status for any still in-progress
    close_old_connections()
    Video.objects.filter(
        id__in=video_ids,
        status__in=['PENDING', 'PROCESSING'],
    ).update(status='CANCELED', progress=0, error_message='Cancelled by user')
    return count


def _update_speed(video_id, current_bytes):
    """Track download speed per video (call from progress callback)."""
    now = _time.monotonic()
    with _speed_lock:
        prev = _speed_data.get(video_id)
        if prev:
            dt = now - prev['last_time']
            if dt >= 0.5:  # update speed every 0.5s
                db = current_bytes - prev['last_bytes']
                speed = (db / dt) / (1024 * 1024) if dt > 0 else 0
                _speed_data[video_id] = {
                    'speed_mbps': round(speed, 2),
                    'last_bytes': current_bytes,
                    'last_time': now,
                }
        else:
            _speed_data[video_id] = {
                'speed_mbps': 0,
                'last_bytes': current_bytes,
                'last_time': now,
            }


def get_download_speeds(video_ids):
    """Return {video_id: speed_mbps} for the requested IDs."""
    with _speed_lock:
        return {
            vid: _speed_data.get(vid, {}).get('speed_mbps', 0)
            for vid in video_ids
        }


def _cleanup_tracking(video_id):
    """Remove a video from cancel/speed tracking caches."""
    with _cancelled_lock:
        _cancelled_ids.discard(video_id)
    with _speed_lock:
        _speed_data.pop(video_id, None)
    with _progress_cache_lock:
        _progress_cache.pop(video_id, None)


# =========================================================================
# OTP Flow
# =========================================================================

def send_otp(user, phone_number: str):
    """Step 1 – Send OTP via Telegram.  Returns phone_code_hash."""
    try:
        config = TelegramConfig.objects.get(user=user)
    except TelegramConfig.DoesNotExist:
        raise ValueError("Save your Telegram API credentials first.")

    # Clean up previous pending client
    with _pending_clients_lock:
        old = _pending_clients.pop(user.id, None)
    if old and old.get('loop'):
        try:
            old['loop'].call_soon_threadsafe(old['loop'].stop)
        except Exception:
            pass

    loop = asyncio.new_event_loop()
    client = TelegramClient(StringSession(), int(config.api_id), config.api_hash)

    phone_code_hash_container = [None]
    error_container = [None]
    ready_event = threading.Event()

    def _otp_thread():
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(client.connect())
            result = loop.run_until_complete(client.send_code_request(phone_number))
            phone_code_hash_container[0] = result.phone_code_hash
        except Exception as e:
            error_container[0] = e
        finally:
            ready_event.set()
        # Keep loop running so client stays connected for verify_otp
        try:
            loop.run_forever()
        except Exception:
            pass
        finally:
            try:
                loop.run_until_complete(client.disconnect())
            except Exception:
                pass
            loop.close()

    t = threading.Thread(target=_otp_thread, daemon=True)
    t.start()
    ready_event.wait(timeout=60)

    if error_container[0]:
        raise error_container[0]

    with _pending_clients_lock:
        _pending_clients[user.id] = {'client': client, 'loop': loop, 'thread': t}

    config.phone_number = phone_number
    config.save(update_fields=['phone_number'])
    return phone_code_hash_container[0]


def verify_otp(user, otp: str, phone_hash: str):
    """Step 2 – Verify OTP and persist session string."""
    with _pending_clients_lock:
        pending = _pending_clients.pop(user.id, None)
    if not pending:
        raise ValueError("No pending verification. Request a new OTP.")

    client = pending['client']
    loop = pending['loop']

    try:
        config = TelegramConfig.objects.get(user=user)
    except TelegramConfig.DoesNotExist:
        raise ValueError("Telegram config not found.")

    error_container = [None]
    session_container = [None]
    done_event = threading.Event()

    def _do_verify():
        try:
            future = asyncio.run_coroutine_threadsafe(
                _verify_coro(client, config.phone_number, otp, phone_hash),
                loop,
            )
            session_container[0] = future.result(timeout=60)
        except Exception as e:
            error_container[0] = e
        finally:
            done_event.set()
            loop.call_soon_threadsafe(loop.stop)

    verify_thread = threading.Thread(target=_do_verify)
    verify_thread.start()
    done_event.wait(timeout=60)

    if error_container[0]:
        raise error_container[0]

    config.session_string = session_container[0]
    config.is_verified = True
    config.save(update_fields=['session_string', 'is_verified'])


async def _verify_coro(client, phone, otp, phone_hash):
    await client.sign_in(phone, otp, phone_code_hash=phone_hash)
    return client.session.save()


# =========================================================================
# Media Scanning
# =========================================================================

def fetch_group_media(user, group_id: str):
    """Scan a Telegram group and return list of all downloadable media."""
    config = TelegramConfig.objects.get(user=user)
    if not config.is_verified:
        raise ValueError("Telegram account not verified. Complete OTP first.")

    try:
        parsed_gid = int(group_id)
    except ValueError:
        parsed_gid = group_id

    async def _scan():
        client = _build_client(config)
        logger.info(f"[scan] Connecting to Telegram for group {parsed_gid} ...")
        await client.connect()

        if not await client.is_user_authorized():
            await client.disconnect()
            raise ValueError("Session expired. Re-verify your phone number.")

        logger.info("[scan] Authorized. Loading dialogs (entity cache) ...")
        # Populate entity cache so raw integer IDs resolve to
        # the correct channel/supergroup peer (needed for private groups).
        await client.get_dialogs()
        logger.info(f"[scan] Dialogs loaded. Iterating messages in {parsed_gid} ...")

        media_list = []
        async for message in client.iter_messages(parsed_gid, limit=None):
            if not (message.media and message.file):
                continue

            name = getattr(message.file, 'name', None)
            if not name:
                ext = getattr(message.file, 'ext', '.file') or '.file'
                name = f"file_{message.id}{ext}"

            display_name = _clean_display_name(name)
            mime = getattr(message.file, 'mime_type', 'application/octet-stream') or 'application/octet-stream'

            if mime.startswith('video/'):
                ftype = 'video'
            elif mime == 'application/pdf':
                ftype = 'pdf'
            elif mime in ('application/zip', 'application/x-zip-compressed',
                          'application/x-rar-compressed', 'application/gzip'):
                ftype = 'archive'
            elif mime.startswith('image/'):
                ftype = 'image'
            else:
                ftype = 'other'

            size_bytes = message.file.size
            size_mb = round(size_bytes / 1_000_000, 1)
            msg_date = message.date.isoformat() if message.date else None

            media_list.append({
                'msg_id': message.id,
                'name': display_name,
                'raw_name': name,
                'size_mb': size_mb,
                'size_bytes': size_bytes,
                'mime_type': mime,
                'type': ftype,
                'date': msg_date,
            })

        await client.disconnect()
        media_list.reverse()          # oldest first, newest last
        return media_list

    return _run_async(_scan())


# =========================================================================
# Download & Upload Pipeline
# =========================================================================

def download_and_upload(user, group_id, message_ids, organization_id,
                        category_id, media_info=None):
    """
    Create Video records upfront, fire background download.
    Returns list of video IDs for progress tracking.
    """
    _ensure_dirs()

    from videos.models import Video
    from vault.models import Category, Organization

    try:
        config = TelegramConfig.objects.get(user=user)
        category = Category.objects.get(id=category_id, user=user)
        organization = Organization.objects.get(id=organization_id, category=category)
        folder_path = f"{category.name}/{organization.name}"
    except Exception as e:
        logger.error(f"Telegram download setup error: {e}")
        return []

    video_records = []
    for msg_id in message_ids:
        info = (media_info or {}).get(str(msg_id), {})
        title = info.get('name', f'telegram_{msg_id}')
        mime = info.get('mime_type', '')
        size = info.get('size_bytes', 0)

        close_old_connections()
        video = Video.objects.create(
            user=user,
            title=title,
            status='PENDING',
            progress=0,
            category=category,
            organization=organization,
            folder_path=folder_path,
            file_size=size,
            mime_type=mime,
        )
        video_records.append({'video_id': video.id, 'msg_id': msg_id})

    TELEGRAM_EXECUTOR.submit(
        _download_worker, user.id, group_id, video_records, folder_path
    )
    return [v['video_id'] for v in video_records]


# ── Background worker ────────────────────────────────────────────────────

def _download_worker(user_id, group_id, video_records, folder_path):
    """Background thread: download files then process/upload each."""
    close_old_connections()

    from django.contrib.auth.models import User

    try:
        user = User.objects.get(id=user_id)
        config = TelegramConfig.objects.get(user=user)
    except Exception as e:
        logger.error(f"Telegram download setup: {e}")
        for rec in video_records:
            _update_video_progress(rec['video_id'], 0, 'FAILED',
                                   error_message=str(e))
        return

    try:
        parsed_gid = int(group_id)
    except ValueError:
        parsed_gid = group_id

    async def _download_all():
        client = _build_client(config)
        await client.connect()

        if not await client.is_user_authorized():
            await client.disconnect()
            for rec in video_records:
                _submit_progress(rec['video_id'], 0, 'FAILED',
                                 error_message='Session expired. Re-verify.')
            return

        # Populate entity cache so raw integer IDs resolve to
        # the correct channel/supergroup peer (needed for private groups).
        await client.get_dialogs()

        total = len(video_records)
        sem = asyncio.Semaphore(SIMULTANEOUS_FILES)

        async def _do_one(rec, idx):
            async with sem:
                await _download_single(client, rec, parsed_gid,
                                       folder_path, idx, total)

        await asyncio.gather(
            *[_do_one(rec, i) for i, rec in enumerate(video_records)]
        )
        await client.disconnect()

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(_download_all())
    finally:
        loop.close()
    logger.info("Telegram download batch complete.")


async def _download_single(client, rec, parsed_gid, folder_path, idx, total):
    """Download one file, then hand off to processing or Drive upload."""
    loop = asyncio.get_event_loop()
    video_id = rec['video_id']
    msg_id = rec['msg_id']

    try:
        _submit_progress(video_id, 2, 'PROCESSING')

        message = await client.get_messages(parsed_gid, ids=msg_id)
        if not message or not message.media or not message.file:
            _submit_progress(video_id, 0, 'FAILED',
                             error_message='Message has no media.')
            return

        name = getattr(message.file, 'name', None)
        if not name:
            ext = getattr(message.file, 'ext', '.file') or '.file'
            name = f"file_{message.id}{ext}"

        display_name = _clean_display_name(name)
        clean_name = re.sub(r'[\\/*?:"<>|]', "", name).strip()
        local_path = os.path.join(DOWNLOAD_TEMP_DIR, f"{video_id}_{clean_name}")

        _submit_progress(video_id, 5, 'PROCESSING')

        # ── Download using Telethon's built-in download_media ──
        # progress_callback runs inside the async loop — offload DB
        # writes to _DB_EXECUTOR.  Also check for cancellation.
        _cancel_flag = [False]

        def _progress_cb(current, total_bytes):
            if _is_cancelled(video_id):
                _cancel_flag[0] = True
                raise asyncio.CancelledError(f"Download cancelled: {video_id}")
            pct = 5 + int((current / (total_bytes or 1)) * 35)
            _submit_progress(video_id, min(pct, 40))
            _update_speed(video_id, current)

        try:
            await client.download_media(
                message,
                file=local_path,
                progress_callback=_progress_cb,
            )
        except (asyncio.CancelledError, Exception) as dl_err:
            if _cancel_flag[0] or _is_cancelled(video_id):
                logger.info(f"Download cancelled: video {video_id}")
                _submit_progress(video_id, 0, 'CANCELED',
                                 error_message='Cancelled by user')
                if os.path.exists(local_path):
                    os.unlink(local_path)
                _cleanup_tracking(video_id)
                return
            raise dl_err

        if not os.path.exists(local_path):
            _submit_progress(video_id, 0, 'FAILED',
                             error_message='Download failed.')
            _cleanup_tracking(video_id)
            return

        _submit_progress(video_id, 40)

        # Check cancellation before processing
        if _is_cancelled(video_id):
            _submit_progress(video_id, 0, 'CANCELED',
                             error_message='Cancelled by user')
            if os.path.exists(local_path):
                os.unlink(local_path)
            _cleanup_tracking(video_id)
            return

        mime = getattr(message.file, 'mime_type', '') or ''
        is_video = mime.startswith('video/')

        # Update Video metadata in executor (sync ORM)
        await loop.run_in_executor(_DB_EXECUTOR, lambda: _db_update_video(
            video_id,
            title=display_name,
            file_size=os.path.getsize(local_path),
            mime_type=mime,
        ))

        if is_video:
            # Videos → ffmpeg 2× speed → Drive upload (sync, run in executor)
            from videos.services import start_background_processing
            await loop.run_in_executor(
                _DB_EXECUTOR,
                lambda: start_background_processing(
                    video_id, local_path, display_name, folder_path
                ),
            )
            logger.info(f"[{idx+1}/{total}] Video queued: {display_name}")
            _cleanup_tracking(video_id)
        else:
            # Non-video → upload to Drive in a subfolder (sync, run in executor)
            def _upload_non_video():
                from videos.services import DriveService
                try:
                    _update_video_progress(video_id, 45, 'PROCESSING')
                    upload_mime = (mime or mimetypes.guess_type(clean_name)[0]
                                   or 'application/octet-stream')
                    drive = DriveService()
                    
                    # Create a subfolder for the file
                    file_folder_name = os.path.splitext(display_name)[0]
                    full_folder_path = f"{folder_path}/{file_folder_name}" if folder_path else file_folder_name
                    video_folder_id = drive.get_or_create_folder(full_folder_path)
                    
                    file_id = drive.upload_to_folder(
                        local_path, display_name, video_folder_id,
                        progress_callback=lambda f: _update_video_progress(
                            video_id, 45 + int(f * 50)),
                        mime_override=upload_mime,
                    )
                    _db_update_video(video_id,
                                     status='COMPLETED', progress=100,
                                     file_id=file_id,
                                     drive_folder_id=video_folder_id)
                    logger.info(f"[{idx+1}/{total}] Uploaded: {display_name}")
                except Exception as err:
                    logger.error(f"Drive upload failed: {err}")
                    _update_video_progress(video_id, 0, 'FAILED',
                                           error_message=str(err))
                finally:
                    if os.path.exists(local_path):
                        os.unlink(local_path)

            await loop.run_in_executor(_DB_EXECUTOR, _upload_non_video)
            _cleanup_tracking(video_id)

    except Exception as err:
        logger.error(f"Error on msg {msg_id}: {err}")
        _submit_progress(video_id, 0, 'FAILED',
                         error_message=str(err))
        _cleanup_tracking(video_id)
