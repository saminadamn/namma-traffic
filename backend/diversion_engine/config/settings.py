"""
Diversion engine settings — inherits DATABASE_URL from the host app env.
"""
import os
from pydantic import Field
from pydantic_settings import BaseSettings


class DiversionSettings(BaseSettings):
    # Uses the same DATABASE_URL as the host FastAPI app
    database_url: str = Field(
        default=os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/traffic_db")
    )
    graph_radius_meters: int = Field(default=2000)
    max_diversion_roads: int = Field(default=5)
    min_diversion_roads: int = Field(default=1)
    closure_threshold_high: float   = Field(default=0.80)
    closure_threshold_medium: float = Field(default=0.60)
    log_level: str = Field(default="INFO")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
        extra = "ignore"


settings = DiversionSettings()
