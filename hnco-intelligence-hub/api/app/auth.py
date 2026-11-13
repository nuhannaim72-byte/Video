"""Authentication (Microsoft Entra ID access tokens) and role-based access control.

App roles (define them on the API app registration and assign them to users/groups):
  Hub.Director  — the Managing Director: assign work, chat, approve or reject, resolve issues, read audit
  Hub.Member    — staff: view, assign work, chat, resolve issues
  Hub.Auditor   — view and read the audit log
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, Request, status

from .config import Settings, get_settings

log = logging.getLogger(__name__)

PERMISSIONS: dict[str, set[str]] = {
    "view": {"Hub.Director", "Hub.Member", "Hub.Auditor"},
    "assign": {"Hub.Director", "Hub.Member"},
    "chat": {"Hub.Director", "Hub.Member"},
    "approve": {"Hub.Director"},
    "resolve": {"Hub.Director", "Hub.Member"},
    "audit": {"Hub.Director", "Hub.Auditor"},
}


@dataclass
class User:
    id: str
    name: str
    roles: list[str] = field(default_factory=list)
    dev: bool = False

    def can(self, permission: str) -> bool:
        return bool(PERMISSIONS[permission].intersection(self.roles))


DEV_USER = User(id="dev-user", name="Managing Director (dev)", roles=["Hub.Director"], dev=True)


@lru_cache
def _jwks_client(tenant_id: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"https://login.microsoftonline.com/{tenant_id}/discovery/v2.0/keys", cache_keys=True)


def validate_entra_token(token: str, settings: Settings) -> User:
    tenant = settings.entra_tenant_id
    assert tenant
    try:
        key = _jwks_client(tenant).get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=settings.entra_audiences,
            issuer=[f"https://login.microsoftonline.com/{tenant}/v2.0", f"https://sts.windows.net/{tenant}/"],
            options={"require": ["exp", "iat", "aud", "iss"]},
        )
    except jwt.PyJWTError as exc:
        log.info("rejected token: %s", exc)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token") from exc
    return User(
        id=claims.get("oid") or claims.get("sub", "unknown"),
        name=claims.get("name") or claims.get("preferred_username") or "Unknown user",
        roles=list(claims.get("roles", [])),
    )


async def current_user(request: Request) -> User:
    # The app's own settings (create_app may be given non-default settings, e.g. in tests).
    settings: Settings = getattr(request.app.state, "settings", None) or get_settings()
    if settings.auth_mode == "dev":
        return DEV_USER
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in with Microsoft Entra ID", headers={"WWW-Authenticate": "Bearer"})
    user = validate_entra_token(header.split(" ", 1)[1], settings)
    if not user.can("view"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No HN.CO Intelligence Hub role assigned")
    return user


def require(permission: str):
    async def dep(user: User = Depends(current_user)) -> User:
        if not user.can(permission):
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Your role does not allow '{permission}'")
        return user

    return dep
