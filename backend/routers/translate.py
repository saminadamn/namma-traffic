"""
translate.py  —  Bhashini-powered batch translation for all 22 Indian languages.

Flow (two-step pipeline):
  1. GET pipeline config from ULCA (cached per process, per language).
  2. POST texts as a batch array to the inference callback URL.

Bhashini accepts an input *array* — no delimiter tricks needed.
Falls back to returning original English strings if any API step fails.
"""
import asyncio
import logging

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()
logger = logging.getLogger("namma_traffic.translate")

_ULCA_CONFIG_URL = "https://meity-auth.ulca.in/ulca/apis/v0/model/getModelsPipeline"
_CONFIG_CACHE: dict[str, dict] = {}   # lang_code → {callback_url, service_id, auth_header}
_CHUNK_SIZE = 40                       # texts per Bhashini call


class TranslateBatchRequest(BaseModel):
    texts: list[str]
    target: str          # BCP-47 2-letter code: "hi", "kn", "te", "ta", …


class TranslateBatchResponse(BaseModel):
    translations: list[str]


async def _pipeline_config(target: str, settings) -> dict:
    """Fetch (and cache) the Bhashini pipeline config for a given target language."""
    if target in _CONFIG_CACHE:
        return _CONFIG_CACHE[target]

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            _ULCA_CONFIG_URL,
            headers={
                "userID": settings.bhashini_user_id,
                "ulcaApiKey": settings.bhashini_udyat_api_key,
                "Content-Type": "application/json",
            },
            json={
                "pipelineTasks": [{
                    "taskType": "translation",
                    "config": {"language": {"sourceLanguage": "en", "targetLanguage": target}},
                }],
                "pipelineRequestConfig": {"pipelineId": settings.bhashini_pipeline_id},
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()

    cfg = data["pipelineResponseConfig"][0]["config"][0]
    result = {
        "callback_url": cfg["apiEndPoint"],
        "service_id":   cfg["serviceId"],
        "auth_header":  {cfg["inferenceApiKey"]["name"]: cfg["inferenceApiKey"]["value"]},
    }
    _CONFIG_CACHE[target] = result
    logger.info("Bhashini config cached  lang=%s  serviceId=%s", target, result["service_id"])
    return result


async def _bhashini_chunk(texts: list[str], target: str, settings) -> list[str]:
    """Translate one chunk via Bhashini inference (true batch, no delimiters)."""
    config = await _pipeline_config(target, settings)

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            config["callback_url"],
            headers={**config["auth_header"], "Content-Type": "application/json"},
            json={
                "pipelineTasks": [{
                    "taskType": "translation",
                    "config": {
                        "language": {"sourceLanguage": "en", "targetLanguage": target},
                        "serviceId": config["service_id"],
                    },
                }],
                "inputData": {
                    "input": [{"source": t} for t in texts],
                    "audio": [],
                },
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()

    outputs = data["pipelineResponse"][0]["output"]
    translated = [o.get("target") or texts[i] for i, o in enumerate(outputs)]
    if len(translated) < len(texts):
        translated += texts[len(translated):]
    return translated


async def _bhashini_translate(texts: list[str], target: str, settings) -> list[str]:
    if not texts:
        return texts
    chunks = [texts[i: i + _CHUNK_SIZE] for i in range(0, len(texts), _CHUNK_SIZE)]
    try:
        results = await asyncio.gather(*[_bhashini_chunk(c, target, settings) for c in chunks])
        flat: list[str] = []
        for r in results:
            flat.extend(r)
        return flat
    except Exception as exc:
        logger.warning("Bhashini failed for %s: %s — returning originals", target, exc)
        return texts


@router.post("", response_model=TranslateBatchResponse)
async def translate_batch(req: TranslateBatchRequest):
    from config import get_settings
    settings = get_settings()

    if not req.texts:
        return TranslateBatchResponse(translations=req.texts)

    if all([
        settings.bhashini_udyat_api_key,
        settings.bhashini_user_id,
        settings.bhashini_pipeline_id,
    ]):
        translations = await _bhashini_translate(req.texts, req.target, settings)
        return TranslateBatchResponse(translations=translations)

    logger.warning("Bhashini keys not configured; returning original strings")
    return TranslateBatchResponse(translations=req.texts)
