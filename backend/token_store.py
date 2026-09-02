"""
Хранение GitHub Personal Access Token между запусками приложения.

Спецификация (раздел 2) требует хранение через Windows Credential Manager /
DPAPI. На практике это делает библиотека `keyring`: на Windows её backend по
умолчанию - `keyring.backends.Windows.WinVaultKeyring`, который использует
Windows Credential Manager (сам он защищает секреты через DPAPI). Никаких
собственных файлов с токеном в открытом виде приложение не создаёт.
"""
from __future__ import annotations

import keyring

_SERVICE_NAME = "MdIssueSync"
_USERNAME = "github-token"


class TokenStoreError(RuntimeError):
    pass


def save_token(token: str) -> None:
    if not token or not token.strip():
        raise TokenStoreError("Токен не может быть пустым")
    try:
        keyring.set_password(_SERVICE_NAME, _USERNAME, token.strip())
    except keyring.errors.KeyringError as exc:  # pragma: no cover - platform-specific
        raise TokenStoreError(f"Не удалось сохранить токен: {exc}") from exc


def load_token() -> str | None:
    try:
        return keyring.get_password(_SERVICE_NAME, _USERNAME)
    except keyring.errors.KeyringError as exc:  # pragma: no cover
        raise TokenStoreError(f"Не удалось прочитать токен: {exc}") from exc


def delete_token() -> None:
    try:
        keyring.delete_password(_SERVICE_NAME, _USERNAME)
    except keyring.errors.PasswordDeleteError:
        # Токена и так не было - не ошибка.
        pass
    except keyring.errors.KeyringError as exc:  # pragma: no cover
        raise TokenStoreError(f"Не удалось удалить токен: {exc}") from exc


def mask_token(token: str) -> str:
    """Токен никогда не показывается полностью (раздел 2)."""
    token = token.strip()
    if len(token) <= 4:
        return "*" * len(token)
    return f"{'*' * (len(token) - 4)}{token[-4:]}"
