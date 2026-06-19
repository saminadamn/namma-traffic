"""
Pydantic schemas for authentication and RBAC endpoints.

Kept in a separate module from schemas/schemas.py (the existing incident/
prediction schemas) rather than appended to that file. Auth schemas are
security-sensitive and change for different reasons than prediction
schemas do — splitting them means a PR touching login validation can't
accidentally also touch (or merge-conflict with) prediction payload
shapes, and vice versa.
"""
import re
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

PHONE_PATTERN = re.compile(r"^[6-9]\d{9}$")  # 10-digit Indian mobile, no country code prefix


class RegisterRequest(BaseModel):
    phone_number: str
    password: str = Field(min_length=8)
    full_name: Optional[str] = None
    email: Optional[str] = None

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        if not PHONE_PATTERN.match(v):
            raise ValueError("phone_number must be a 10-digit Indian mobile number")
        return v


class LoginRequest(BaseModel):
    phone_number: Optional[str] = None
    email: Optional[str] = None
    password: str

    @field_validator("phone_number", mode="before")
    @classmethod
    def coerce_empty_to_none(cls, v: object) -> object:
        return v or None

    @field_validator("email", mode="before")
    @classmethod
    def coerce_empty_email_to_none(cls, v: object) -> object:
        return v or None

    def identifier(self) -> str:
        return self.phone_number or self.email or ""


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int   # seconds — access token lifetime, lets clients schedule refresh


class UserOut(BaseModel):
    id: str
    phone_number: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    is_active: bool
    roles: list[str]
    permissions: list[str]


class RoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class AssignRoleRequest(BaseModel):
    role_name: str
