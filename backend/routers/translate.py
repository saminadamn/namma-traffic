import asyncio
import httpx
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

_MYMEMORY_URL = "https://api.mymemory.translated.net/get"
_DELIMITER = "\n[||]\n"  # unlikely to appear in UI strings or be translated
_CHUNK = 15               # strings per Sarvam call
_FREE_BATCH = 5           # concurrent MyMemory requests


class TranslateBatchRequest(BaseModel):
    texts: list[str]
    target: str  # "hi-IN" or "kn-IN"


class TranslateBatchResponse(BaseModel):
    translations: list[str]


async def _sarvam_chunk(texts: list[str], target: str, key: str) -> list[str]:
    joined = _DELIMITER.join(texts)
    try:
        from sarvamai import AsyncSarvamAI
        client = AsyncSarvamAI(api_subscription_key=key)
        response = await client.text.translate(
            input=joined,
            source_language_code="en-IN",
            target_language_code=target,
            speaker_gender="Female",
            mode="formal",
        )
        translated = response.translated_text or joined
        parts = translated.split(_DELIMITER)
        if len(parts) != len(texts):
            parts = parts[:len(texts)] + texts[len(parts):]
        return parts
    except Exception:
        return texts


async def _mymemory_single(client: httpx.AsyncClient, text: str, lang_code: str) -> str:
    try:
        resp = await client.get(
            _MYMEMORY_URL,
            params={"q": text, "langpair": f"en|{lang_code}"},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json().get("responseData", {}).get("translatedText", text) or text
    except Exception:
        return text


async def _mymemory_batch(texts: list[str], target: str) -> list[str]:
    lang_code = target.split("-")[0]  # "hi-IN" → "hi"
    results: list[str] = []
    async with httpx.AsyncClient() as client:
        for i in range(0, len(texts), _FREE_BATCH):
            chunk = texts[i : i + _FREE_BATCH]
            translated = await asyncio.gather(
                *[_mymemory_single(client, t, lang_code) for t in chunk]
            )
            results.extend(translated)
    return results


@router.post("", response_model=TranslateBatchResponse)
async def translate_batch(req: TranslateBatchRequest):
    from config import get_settings
    settings = get_settings()

    if not req.texts:
        return TranslateBatchResponse(translations=req.texts)

    # Primary: Sarvam AI SDK (when key is configured)
    if settings.sarvam_api_key:
        chunks = [req.texts[i : i + _CHUNK] for i in range(0, len(req.texts), _CHUNK)]
        results = await asyncio.gather(
            *[_sarvam_chunk(chunk, req.target, settings.sarvam_api_key) for chunk in chunks]
        )
        flat: list[str] = []
        for r in results:
            flat.extend(r)
        return TranslateBatchResponse(translations=flat)

    # Fallback: MyMemory (free, no key needed)
    translations = await _mymemory_batch(req.texts, req.target)
    return TranslateBatchResponse(translations=translations)
