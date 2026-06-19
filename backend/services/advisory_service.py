"""
Multilingual traffic advisory generator.

Pipeline:
  1. Gemini 1.5 Flash generates a concise English advisory from structured
     incident context using an official traffic-police prompt.
     Falls back to rule-based templates if GEMINI_API_KEY is not set.
  2. Sarvam AI translates the English text into Hindi (hi-IN) and
     Kannada (kn-IN). If SARVAM_API_KEY is absent, translations are
     returned as empty strings.
"""
import asyncio
import logging
from datetime import datetime, timezone

logger = logging.getLogger("namma_traffic.advisory")

_TEMPLATES = {
    "Critical": (
        "URGENT: {address} ({zone}) is showing critical congestion risk ({score}%). "
        "Immediate officer deployment and road diversion required."
    ),
    "High": (
        "{address} ({zone}) is at high congestion risk ({score}%). "
        "Increase patrol presence and prepare diversion routes."
    ),
    "Medium": (
        "{address} ({zone}) shows moderate congestion risk ({score}%). "
        "Routine monitoring advised; no immediate action required."
    ),
    "Low": (
        "{address} ({zone}) is at low risk ({score}%). No action needed at this time."
    ),
}

_GEMINI_PROMPT = """\
You are an AI assistant for Bengaluru Traffic Police Control Room.
Generate a concise, official traffic advisory (max 60 words) for:
  Location : {address}, Zone: {zone}
  Event    : {event_type}
  Severity : {severity_label} ({score}%)

Rules:
- Start with the severity level in CAPS (e.g. HIGH:, CRITICAL:)
- Be specific about location and recommended officer action
- Official tone, no emojis
- Return ONLY the advisory text, nothing else"""


def _rule_based_english(address: str, zone: str, severity_label: str, severity_score: int) -> str:
    tmpl = _TEMPLATES.get(severity_label, _TEMPLATES["Medium"])
    return tmpl.format(address=address, zone=zone or "Unknown Zone", score=severity_score)


def _call_gemini(prompt: str, api_key: str) -> str:
    """Sync Gemini call — run via asyncio.to_thread to stay non-blocking."""
    import google.generativeai as genai
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name="gemini-1.5-flash",
        generation_config={"max_output_tokens": 150, "temperature": 0.4},
    )
    response = model.generate_content(prompt)
    return response.text.strip()


async def _gemini_english(
    address: str, zone: str, severity_label: str, severity_score: int,
    event_type: str, gemini_key: str,
) -> str:
    prompt = _GEMINI_PROMPT.format(
        address=address,
        zone=zone or "Unknown Zone",
        event_type=event_type,
        severity_label=severity_label,
        score=severity_score,
    )
    return await asyncio.to_thread(_call_gemini, prompt, gemini_key)


async def _sarvam_translate(text: str, target_lang_code: str, sarvam_key: str) -> str:
    from sarvamai import AsyncSarvamAI
    client = AsyncSarvamAI(api_subscription_key=sarvam_key)
    response = await client.text.translate(
        input=text,
        source_language_code="en-IN",
        target_language_code=target_lang_code,
        speaker_gender="Male",
        mode="formal",
    )
    return response.translated_text or ""


async def generate_advisory(
    address: str,
    zone: str,
    severity_label: str,
    severity_score: int,
    event_type: str = "incident",
) -> dict:
    from config import get_settings
    settings = get_settings()

    method_parts: list[str] = []

    # ── Step 1: English advisory ──────────────────────────────────
    if settings.gemini_api_key:
        try:
            en_text = await _gemini_english(
                address, zone, severity_label, severity_score, event_type,
                settings.gemini_api_key,
            )
            method_parts.append("gemini_flash")
        except Exception as exc:
            logger.warning("Gemini advisory failed (%s) — using rule-based fallback", exc)
            en_text = _rule_based_english(address, zone, severity_label, severity_score)
            method_parts.append("rule_based_fallback")
    else:
        en_text = _rule_based_english(address, zone, severity_label, severity_score)
        method_parts.append("rule_based_template")

    # ── Step 2: Sarvam AI translation ─────────────────────────────
    hi_text = kn_text = ""
    if settings.sarvam_api_key:
        try:
            hi_text, kn_text = await asyncio.gather(
                _sarvam_translate(en_text, "hi-IN", settings.sarvam_api_key),
                _sarvam_translate(en_text, "kn-IN", settings.sarvam_api_key),
            )
            method_parts.append("sarvam_translate")
        except Exception as exc:
            logger.warning("Sarvam translation failed (%s) — omitting translations", exc)

    return {
        "en": en_text,
        "hi": hi_text,
        "kn": kn_text,
        "severity_label": severity_label,
        "method": "+".join(method_parts),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
