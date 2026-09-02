"""
Точка входа. В dev-режиме грузит Vite dev server (для горячей перезагрузки
фронтенда), в production - собранный статический билд из frontend/dist.

Запуск:
    dev:  WEBVIEW_DEV=1 python main.py   (параллельно: npm run dev в frontend/)
    prod: python main.py                  (сначала: npm run build в frontend/)

Раздел 6/12: drag&drop и Ctrl+V должны добавлять в Upload-очередь реальные
файлы/папки с диска.

- Drag&drop: обычный браузерный File API из соображений безопасности не
  отдаёт полный путь к файлу - pywebview решает это через свой DOM-мост
  (webview.dom), который на Windows/WebView2 прокидывает
  ICoreWebView2File.Path как 'pywebviewFullPath'
  (см. https://pywebview.flowrl.com/examples/drag_drop.html).
- Ctrl+V: у pywebview нет задокументированного аналога для paste, поэтому
  вставка реализована напрямую через pywin32 (CF_HDROP/CF_UNICODETEXT) в
  Api.paste_from_clipboard() - см. api.py. Фронтенд вызывает этот метод по
  событию keydown (Ctrl+V) и обрабатывает результат тем же пайплайном, что
  и drag&drop.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import webview
from webview.dom import DOMEventHandler

from api import Api

_BACKEND_DIR = Path(__file__).resolve().parent
_FRONTEND_DIST = _BACKEND_DIR.parent / "frontend" / "dist" / "index.html"


def _extract_paths(event: dict) -> list[str]:
    transfer = event.get("dataTransfer") or event.get("domTransfer") or {}
    files = transfer.get("files") or []
    paths = []
    for f in files:
        path = f.get("pywebviewFullPath")
        if path:
            paths.append(path)
    return paths


def _bind_native_file_input(window: webview.Window, api: Api) -> None:
    def handle(event: dict) -> None:
        paths = _extract_paths(event)
        if paths:
            api.on_native_paths_added(paths)

    def noop(_event: dict) -> None:
        pass

    doc = window.dom.document
    # prevent_default=True обязателен: иначе WebView2 попытается открыть
    # перетащенный файл как страницу вместо передачи его приложению.
    doc.events.dragenter += DOMEventHandler(noop, True, True)
    doc.events.dragover += DOMEventHandler(noop, True, True, debounce=200)
    doc.events.drop += DOMEventHandler(handle, True, True)
    # Ctrl+V обрабатывается отдельно через Api.paste_from_clipboard()
    # (pywin32/CF_HDROP) - см. комментарий в начале файла: надёжного
    # paste-биндинга через window.dom для получения путей к файлам нет.


def main() -> None:
    api = Api()

    if os.environ.get("WEBVIEW_DEV") == "1":
        url = "http://localhost:5173"
    else:
        if not _FRONTEND_DIST.exists():
            sys.exit(
                f"Не найден собранный фронтенд: {_FRONTEND_DIST}\n"
                "Выполните: cd frontend && npm install && npm run build"
            )
        url = str(_FRONTEND_DIST)

    window = webview.create_window(
        "Markdown ⇄ GitHub Issues",
        url=url,
        js_api=api,
        width=1200,
        height=800,
        min_size=(900, 600),
    )

    def on_loaded():
        _bind_native_file_input(window, api)

    window.events.loaded += on_loaded
    webview.start(debug=os.environ.get("WEBVIEW_DEV") == "1")


if __name__ == "__main__":
    main()

