"""
Раздел 11: настройки приложения (кроме токена - он в token_store.py, т.к.
хранится отдельно через DPAPI/Credential Manager).

Хранится в %APPDATA%/MdIssueSync/settings.json на Windows, локально, без
сети. Сохраняется автоматически при каждом изменении.
"""
from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path


def _settings_dir() -> Path:
    base = os.environ.get("APPDATA") or str(Path.home())
    return Path(base) / "MdIssueSync"


def _settings_path() -> Path:
    return _settings_dir() / "settings.json"


@dataclass
class Settings:
    last_repo_full_name: str | None = None
    download_default_folder: str | None = None
    window_width: int = 1200
    window_height: int = 800


class SettingsStore:
    def __init__(self):
        self._path = _settings_path()
        self.settings = self._load()

    def _load(self) -> Settings:
        try:
            with open(self._path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return Settings(**{**asdict(Settings()), **data})
        except (OSError, ValueError):
            return Settings()

    def save(self) -> None:
        _settings_dir().mkdir(parents=True, exist_ok=True)
        tmp_path = self._path.with_suffix(".tmp")
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(asdict(self.settings), f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, self._path)

    def update(self, **kwargs) -> None:
        for key, value in kwargs.items():
            if hasattr(self.settings, key):
                setattr(self.settings, key, value)
        self.save()
