import asyncio
import logging

from fastapi import UploadFile

logger = logging.getLogger("namma_traffic.upload")

_MAX_BYTES = 10 * 1_048_576  # 10 MB


async def upload_photo(photo: UploadFile | None) -> str | None:
    """Upload a citizen-report photo to Cloudinary and return the secure URL.

    Returns None without raising when:
    - no file was attached
    - Cloudinary env vars are not set (graceful no-op for local dev)
    - the file is not an image or exceeds 10 MB
    - the upload fails for any reason (network, quota, etc.)

    The caller always gets a URL or None — never an exception — so a
    Cloudinary outage can't prevent a report from being submitted.
    """
    if photo is None or not getattr(photo, "filename", None):
        return None

    from config import get_settings
    s = get_settings()

    if not all([s.cloudinary_cloud_name, s.cloudinary_api_key, s.cloudinary_api_secret]):
        return None

    content_type = photo.content_type or ""
    if not content_type.startswith("image/"):
        logger.warning("Rejected non-image upload: content_type=%r", content_type)
        return None

    data = await photo.read()
    if len(data) > _MAX_BYTES:
        logger.warning("Photo too large (%d bytes > %d limit), skipping upload", len(data), _MAX_BYTES)
        return None

    try:
        return await asyncio.to_thread(_do_upload, data, s)
    except Exception as exc:
        logger.warning("Cloudinary upload failed (%s) — report saved without photo", exc)
        return None


def _do_upload(data: bytes, s) -> str:
    """Synchronous Cloudinary upload — run via asyncio.to_thread."""
    import cloudinary
    import cloudinary.uploader

    cloudinary.config(
        cloud_name=s.cloudinary_cloud_name,
        api_key=s.cloudinary_api_key,
        api_secret=s.cloudinary_api_secret,
        secure=True,
    )
    result = cloudinary.uploader.upload(
        data,
        folder="namma_traffic/reports",
        resource_type="image",
        allowed_formats=["jpg", "jpeg", "png", "webp", "gif"],
        max_bytes=_MAX_BYTES,
    )
    return result["secure_url"]
