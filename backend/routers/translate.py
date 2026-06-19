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


async def _sarvam_single(text: str, target: str, key: str) -> str:
    try:
        from sarvamai import AsyncSarvamAI
        client = AsyncSarvamAI(api_subscription_key=key)
        response = await client.text.translate(
            input=text,
            source_language_code="en-IN",
            target_language_code=target,
            speaker_gender="Female",
            mode="formal",
        )
        return response.translated_text or text
    except Exception:
        return text


async def _sarvam_batch(texts: list[str], target: str, key: str) -> list[str]:
    sem = asyncio.Semaphore(4)
    async def _call(t: str) -> str:
        async with sem:
            return await _sarvam_single(t, target, key)
    return list(await asyncio.gather(*[_call(t) for t in texts]))


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
        translations = await _sarvam_batch(req.texts, req.target, settings.sarvam_api_key)
        return TranslateBatchResponse(translations=translations)

    # Fallback: MyMemory (free, no key needed)
    translations = await _mymemory_batch(req.texts, req.target)
    return TranslateBatchResponse(translations=translations)
