"""
Раздел 2 (overview): непредвиденные ошибки - те, что не относятся к уже
смоделированным доменным типам (GitHubApiError, MarkdownReadError,
InvalidRepoUrlError и т.п.) - не должны ронять приложение или молча
теряться. Такие ошибки логируются здесь с traceback, наружу в UI отдаётся
только безопасное обобщённое сообщение без деталей.

Каталог логов - рядом с settings.json (см. settings_store._settings_dir),
чтобы не плодить отдельную схему путей.
"""
from __future__ import annotations

import os
import traceback
from datetime import datetime, timezone
from pathlib import Path


def _logs_dir() -> Path:
    base = os.environ.get("APPDATA") or str(Path.home())
    return Path(base) / "MdIssueSync" / "logs"


def _log_path() -> Path:
    return _logs_dir() / "errors.log"


GENERIC_MESSAGE = "Unexpected error occurred. Details were saved to the application log."


def log_unexpected_error(context: str, exc: BaseException) -> None:
    """Пишет traceback в лог-файл. Не должна сама бросать исключения наружу -
    логирование не должно мешать основной операции (раздел 2)."""
    try:
        _logs_dir().mkdir(parents=True, exist_ok=True)
        ts = datetime.now(timezone.utc).isoformat()
        entry = f"[{ts}] {context}\n{traceback.format_exc()}\n"
        with open(_log_path(), "a", encoding="utf-8") as f:
            f.write(entry)
    except Exception:
        pass
