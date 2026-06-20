from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    frontend_url: str = "http://localhost:3000"
    model_path: str = "models/catboost_model.pkl"
    xgb_model_path: str = "models/xgb_model.pkl"
    tfidf_path: str = "models/tfidf.pkl"
    weather_lat: float = 12.9716
    weather_lon: float = 77.5946

    # ── Added for Priority 1 (RBAC / auth) — see core/database.py, core/security.py ──
    database_url: str = "postgresql://namma:namma@localhost:5432/namma_traffic"
    jwt_secret_key: str = "dev-only-secret-CHANGE-ME-with-openssl-rand-hex-32"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # ── Multilingual advisory ──
    sarvam_api_key: str = ""      # Sarvam AI translation (Indian languages)
    gemini_api_key: str = ""      # Gemini Flash advisory generation (free tier)

    # ── Bhashini translation (22 Indian languages) ──
    bhashini_inference_api_key: str = ""   # Dhruva inference key
    bhashini_udyat_api_key: str = ""       # ULCA pipeline config key
    bhashini_user_id: str = ""
    bhashini_pipeline_id: str = ""

    # ── Photo upload (Cloudinary free tier) ──
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""

    # ── Redis (optional — Upstash free tier for token blacklist + perm cache) ──
    redis_url: str = ""  # e.g. rediss://default:xxx@host:6379 (Upstash free tier)

    class Config:
        env_file = ".env"

@lru_cache
def get_settings() -> Settings:
    return Settings()
