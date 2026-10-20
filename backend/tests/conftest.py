import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:  # pragma: no cover - зависит от окружения
    import webview  # noqa: F401
except Exception:  # на CI без GUI-бэкенда подменяем только нативное окно
    stub = types.ModuleType("webview")
    stub.windows = []
    stub.FOLDER_DIALOG = stub.OPEN_DIALOG = 0
    sys.modules["webview"] = stub


@pytest.fixture
def isolated_appdata(tmp_path, monkeypatch):
    """Настройки и логи приложения не должны попадать в реальный профиль."""
    monkeypatch.setenv("APPDATA", str(tmp_path))
    return tmp_path
