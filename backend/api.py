"""
Класс Api - единственная точка входа, которую вызывает React через
window.pywebview.api.<method>(...). Каждый публичный метод возвращает
JSON-сериализуемые данные (dict/list/примитивы) или бросает Exception с
понятным текстом - pywebview прокидывает исключение в JS как rejected
Promise.

Долгие операции (bulk download/upload) выполняются в отдельном потоке и
отдают прогресс через window.dispatchEvent(...) на стороне JS
(см. _emit()); сам API-метод возвращает управление сразу же, чтобы UI не
блокировался.
"""
from __future__ import annotations

import os
import threading
import uuid
from dataclasses import asdict
from pathlib import Path

import webbrowser

import webview

from filename_utils import build_download_filename
from github_client import GitHubAuthError, GitHubClient, GitHubApiError
from settings_store import SettingsStore
from token_store import delete_token, load_token, mask_token, save_token
from upload_queue import (
    DuplicateAction,
    UploadItem,
    find_duplicate,
    rescan_single_directory,
    scan_paths_for_markdown,
)
from url_parser import InvalidRepoUrlError, parse_repo_url


class OperationInProgressError(RuntimeError):
    pass


class Api:
    def __init__(self):
        self._settings = SettingsStore()
        self._client: GitHubClient | None = None
        self._current_repo: str | None = None  # "owner/repo"
        self._upload_queue: list[UploadItem] = []
        self._operation_lock = threading.Lock()
        self._operation_in_progress = False
        self._issues_page_cache: dict[tuple, list] = {}
        self._cancel_flags: dict[str, bool] = {}

        token = self._safe_load_token()
        if token:
            self._client = GitHubClient(token)
        if self._settings.settings.last_repo_full_name:
            self._current_repo = self._settings.settings.last_repo_full_name

    # -- вспомогательное --------------------------------------------------

    def _safe_load_token(self) -> str | None:
        try:
            return load_token()
        except Exception:
            return None

    def _require_client(self) -> GitHubClient:
        if self._client is None:
            raise GitHubAuthError("Токен GitHub не задан. Откройте настройки и введите токен.")
        return self._client

    def _emit(self, event: str, payload: dict) -> None:
        window = webview.windows[0] if webview.windows else None
        if window is None:
            return
        import json

        safe_payload = json.dumps(payload)
        window.evaluate_js(
            f"window.dispatchEvent(new CustomEvent({event!r}, {{ detail: {safe_payload} }}))"
        )

    # -- Раздел 1: общее состояние -----------------------------------------

    def get_app_state(self) -> dict:
        account = None
        if self._client is not None:
            try:
                user = self._client.get_authenticated_user()
                account = {"login": user.login, "avatar_url": user.avatar_url}
            except GitHubApiError:
                account = None
        return {
            "account": account,
            "current_repo": self._current_repo,
            "operation_in_progress": self._operation_in_progress,
            "has_token": self._client is not None,
        }

    # -- Раздел 2: авторизация -----------------------------------------------

    def save_github_token(self, token: str) -> dict:
        client = GitHubClient(token)
        try:
            user = client.get_authenticated_user()
        except GitHubAuthError as exc:
            raise GitHubAuthError(str(exc)) from exc
        save_token(token)
        self._client = client
        return {"login": user.login, "avatar_url": user.avatar_url, "masked_token": mask_token(token)}

    def delete_github_token(self) -> None:
        # Подтверждение запрашивается на стороне UI перед вызовом этого метода
        # (раздел 2: "Перед удалением токена требуется подтверждение").
        delete_token()
        self._client = None

    def has_saved_token_masked(self) -> str | None:
        token = self._safe_load_token()
        return mask_token(token) if token else None

    # -- Раздел 3: выбор репозитория -----------------------------------------

    def _ensure_no_active_operation(self) -> None:
        if self._operation_in_progress:
            raise OperationInProgressError(
                "Нельзя менять репозиторий во время активной операции"
            )

    def list_repositories(self) -> list[dict]:
        client = self._require_client()
        repos = client.list_repositories()
        return [asdict(r) for r in repos]

    def select_repository_by_full_name(self, full_name: str) -> dict:
        self._ensure_no_active_operation()
        client = self._require_client()
        owner, _, repo = full_name.partition("/")
        try:
            summary = client.get_repository(owner, repo)
        except GitHubApiError as exc:
            raise GitHubApiError(f"Репозиторий недоступен: {exc}") from exc
        self._current_repo = summary.full_name
        self._settings.update(last_repo_full_name=summary.full_name)
        self._invalidate_issues_cache()
        return asdict(summary)

    def select_repository_by_url(self, url: str) -> dict:
        self._ensure_no_active_operation()
        try:
            ref = parse_repo_url(url)
        except InvalidRepoUrlError as exc:
            raise InvalidRepoUrlError(str(exc)) from exc
        return self.select_repository_by_full_name(ref.full_name)

    def list_repository_labels(self) -> list[dict]:
        client = self._require_client()
        if not self._current_repo:
            return []
        owner, _, repo = self._current_repo.partition("/")
        return [asdict(l) for l in client.list_labels(owner, repo)]

    # -- Раздел 4: Download - список Issues -----------------------------------

    def list_issues(
        self,
        page: int = 1,
        state: str = "open",
        labels: list[str] | None = None,
        sort: str = "created",
        direction: str = "desc",
        search: str | None = None,
    ) -> dict:
        client = self._require_client()
        if not self._current_repo:
            raise ValueError("Репозиторий не выбран")
        owner, _, repo = self._current_repo.partition("/")

        cache_key = (self._current_repo, page, state, tuple(labels or ()), sort, direction, search)
        if cache_key in self._issues_page_cache:
            issues = self._issues_page_cache[cache_key]
        else:
            if search:
                issues = client.search_issues_by_title(owner, repo, search, state=state, page=page, per_page=10)
            else:
                issues = client.list_issues(
                    owner, repo, state=state, labels=labels, sort=sort, direction=direction, page=page, per_page=10
                )
            self._issues_page_cache[cache_key] = issues

        return {
            "issues": [
                {**asdict(i), "labels": [asdict(l) for l in i.labels]} for i in issues
            ]
        }

    def refresh_issues_cache(self) -> None:
        self._invalidate_issues_cache()

    def _invalidate_issues_cache(self) -> None:
        """Единая точка сброса кэша списка issues. Вызывается при любом
        действии, способном изменить набор issues в репозитории (смена репо,
        ручной refresh, успешная отправка upload'а и т.д.), и уведомляет
        фронтенд, чтобы открытые экраны могли перезагрузить список сами."""
        self._issues_page_cache.clear()
        self._emit("issues-changed", {})

    # -- Раздел 5: Download - сохранение файлов ------------------------------

    def open_in_browser(self, url: str) -> None:
        webbrowser.open(url)

    def choose_download_folder(self) -> str | None:
        window = webview.windows[0]
        result = window.create_file_dialog(webview.FOLDER_DIALOG)
        return result[0] if result else None

    def check_download_conflict(self, folder: str, issue_number: int, title: str, body: str) -> dict:
        filename = build_download_filename(issue_number, title)
        path = Path(folder) / filename
        content = body if body.endswith("\n") else body + "\n"
        if not path.exists():
            return {"conflict": False, "filename": filename}
        existing = path.read_text(encoding="utf-8", errors="replace")
        if existing == content:
            return {"conflict": False, "filename": filename, "identical": True}
        return {"conflict": True, "filename": filename}

    def save_issue_markdown(self, folder: str, issue_number: int, title: str, body: str, overwrite: bool = False) -> dict:
        filename = build_download_filename(issue_number, title)
        path = Path(folder) / filename
        content = body if body.endswith("\n") else body + "\n"
        if path.exists() and not overwrite:
            existing = path.read_text(encoding="utf-8", errors="replace")
            if existing != content:
                raise FileExistsError(f"Файл уже существует и отличается по содержимому: {filename}")
        path.write_text(content, encoding="utf-8")
        return {"filename": filename, "path": str(path)}

    def bulk_download(self, folder: str, issues: list[dict]) -> str:
        """issues: [{number, title, body}]. Возвращает job_id для отслеживания
        через события 'download-progress' / 'download-done'."""
        self._ensure_no_active_operation()
        job_id = str(uuid.uuid4())
        self._cancel_flags[job_id] = False
        self._operation_in_progress = True

        def worker():
            saved, skipped, errors = [], [], []
            try:
                for idx, item in enumerate(issues):
                    if self._cancel_flags.get(job_id):
                        break
                    try:
                        result = self.save_issue_markdown(folder, item["number"], item["title"], item["body"])
                        saved.append(result["filename"])
                    except FileExistsError:
                        skipped.append(item["number"])
                    except Exception as exc:  # noqa: BLE001
                        errors.append({"number": item["number"], "error": str(exc)})
                    self._emit(
                        "download-progress",
                        {"job_id": job_id, "done": idx + 1, "total": len(issues)},
                    )
            finally:
                self._operation_in_progress = False
                self._emit(
                    "download-done",
                    {"job_id": job_id, "saved": saved, "skipped": skipped, "errors": errors},
                )

        threading.Thread(target=worker, daemon=True).start()
        return job_id

    def cancel_job(self, job_id: str) -> None:
        self._cancel_flags[job_id] = True

    # -- Раздел 6/7/8: Upload-очередь -----------------------------------------

    def paste_from_clipboard(self) -> list[str]:
        """Раздел 6/12: Ctrl+V. Пути к файлам вставляются либо как список
        файлов Проводника (CF_HDROP), либо как обычный текст с путями по
        одному на строку - оба варианта дают тот же результат, что и
        drag&drop, поэтому оба прогоняются через один и тот же
        scan_paths_for_upload()/read_and_stage_file() пайплайн на фронтенде.
        """
        import win32clipboard
        import win32con

        win32clipboard.OpenClipboard()
        try:
            if win32clipboard.IsClipboardFormatAvailable(win32con.CF_HDROP):
                paths = win32clipboard.GetClipboardData(win32con.CF_HDROP)
                return list(paths)
            if win32clipboard.IsClipboardFormatAvailable(win32con.CF_UNICODETEXT):
                text = win32clipboard.GetClipboardData(win32con.CF_UNICODETEXT)
                candidates = [line.strip().strip('"') for line in text.splitlines()]
                return [c for c in candidates if c and os.path.exists(c)]
            return []
        finally:
            win32clipboard.CloseClipboard()

    def choose_upload_files(self) -> list[str]:
        window = webview.windows[0]
        result = window.create_file_dialog(
            webview.OPEN_DIALOG, allow_multiple=True, file_types=("Markdown (*.md;*.markdown)", "Все файлы (*.*)")
        )
        return list(result) if result else []

    def choose_upload_folders(self) -> list[str]:
        window = webview.windows[0]
        result = window.create_file_dialog(webview.FOLDER_DIALOG, allow_multiple=True)
        return list(result) if result else []

    def on_native_paths_added(self, paths: list[str]) -> None:
        """Вызывается из main.py при нативном drag&drop/paste (Ctrl+V) файлов
        из Windows Explorer. Раздел 12: должен давать тот же результат, что и
        обычное добавление через диалог - поэтому просто пробрасывает пути во
        фронтенд, который прогоняет их через тот же scan/read-пайплайн."""
        self._emit("native-paths-added", {"paths": paths})

    def scan_paths_for_upload(self, paths: list[str]) -> dict:
        """Раздел 6: первый шаг - только обход файловой системы, без чтения
        содержимого. Ошибки чтения файлов обрабатываются отдельным вызовом
        read_and_stage_file() для каждого файла, чтобы фронтенд мог показать
        Retry/Skip/Apply to all именно там, где возникла проблема."""
        scan = scan_paths_for_markdown(paths)
        return {
            "files": scan.files,
            "unreadable_dirs": scan.unreadable_dirs,
            "skipped_non_markdown": scan.skipped_non_markdown,
        }

    def rescan_directory(self, directory: str) -> dict:
        """Retry для конкретной недоступной директории."""
        scan = rescan_single_directory(directory)
        return {
            "files": scan.files,
            "unreadable_dirs": scan.unreadable_dirs,
            "skipped_non_markdown": scan.skipped_non_markdown,
        }

    def read_and_stage_file(self, path: str) -> dict:
        """Читает один файл и либо добавляет его в очередь, либо возвращает
        информацию о найденном дубликате (раздел 8). Бросает исключение при
        ошибке чтения - фронтенд ловит её и предлагает Retry/Skip/Apply to all
        (раздел 6)."""
        item = UploadItem.from_file(path)
        dup = find_duplicate(self._upload_queue, item)
        if dup is not None:
            return {
                "status": "duplicate",
                "new_item": _item_to_dict(item),
                "existing_item_id": dup.id,
            }
        self._upload_queue.append(item)
        return {"status": "added", "item": _item_to_dict(item)}

    def resolve_duplicate(self, pending_item: dict, existing_item_id: str, action: str) -> dict:
        item = _item_from_dict(pending_item)
        if action == DuplicateAction.SKIP:
            return {"queue": self.get_upload_queue()}
        if action == DuplicateAction.KEEP_BOTH:
            self._upload_queue.append(item)
        elif action == DuplicateAction.REPLACE:
            self._upload_queue = [q for q in self._upload_queue if q.id != existing_item_id]
            self._upload_queue.append(item)
        else:
            raise ValueError(f"Unknown action: {action}")
        return {"queue": self.get_upload_queue()}

    def get_upload_queue(self) -> list[dict]:
        return [_item_to_dict(i) for i in self._upload_queue]

    def update_upload_item(self, item_id: str, title: str | None = None, labels: list[str] | None = None) -> dict:
        for item in self._upload_queue:
            if item.id == item_id:
                if title is not None:
                    item.title = title
                if labels is not None:
                    item.labels = labels
                return _item_to_dict(item)
        raise ValueError("Item not found")

    def bulk_update_labels(self, item_ids: list[str], labels: list[str]) -> list[dict]:
        for item in self._upload_queue:
            if item.id in item_ids:
                item.labels = labels
        return self.get_upload_queue()

    def remove_upload_items(self, item_ids: list[str]) -> list[dict]:
        self._upload_queue = [i for i in self._upload_queue if i.id not in item_ids]
        return self.get_upload_queue()

    def clear_upload_queue(self) -> None:
        self._upload_queue = []

    # -- Раздел 9: локальная валидация ----------------------------------------

    def validate_upload_queue(self) -> dict:
        problems = []
        for item in self._upload_queue:
            item_problems = []
            if not item.title or not item.title.strip():
                item_problems.append("Отсутствует title")
            if len(item.body) > 1_000_000:
                item_problems.append("Body превышает допустимый размер")
            if item_problems:
                item.error = "; ".join(item_problems)
                problems.append({"item_id": item.id, "problems": item_problems})
            else:
                item.error = None
        return {"ok": len(problems) == 0, "problems": problems}

    # -- Раздел 10: отправка в GitHub ------------------------------------------

    def submit_upload(self, item_ids: list[str] | None = None) -> str:
        """item_ids=None -> отправить всю очередь. При повторной отправке после
        частичной ошибки передаются только id неуспешных элементов."""
        self._ensure_no_active_operation()
        client = self._require_client()
        if not self._current_repo:
            raise ValueError("Репозиторий не выбран")
        owner, _, repo = self._current_repo.partition("/")

        validation = self.validate_upload_queue()
        if not validation["ok"]:
            raise ValueError("Локальная проверка не пройдена; исправьте элементы очереди")

        targets = (
            [i for i in self._upload_queue if i.id in item_ids]
            if item_ids is not None
            else list(self._upload_queue)
        )

        job_id = str(uuid.uuid4())
        self._cancel_flags[job_id] = False
        self._operation_in_progress = True

        def worker():
            succeeded_ids, failed = [], []
            try:
                for idx, item in enumerate(targets):
                    if self._cancel_flags.get(job_id):
                        break
                    try:
                        client.create_issue(owner, repo, item.title, item.body, item.labels)
                        succeeded_ids.append(item.id)
                    except Exception as exc:  # noqa: BLE001
                        failed.append({"item_id": item.id, "error": str(exc)})
                    self._emit(
                        "upload-progress",
                        {"job_id": job_id, "done": idx + 1, "total": len(targets)},
                    )
            finally:
                self._upload_queue = [i for i in self._upload_queue if i.id not in succeeded_ids]
                self._operation_in_progress = False
                if not self._upload_queue:
                    pass  # раздел 6: очередь очищается только после подтверждённой полностью успешной отправки
                if succeeded_ids:
                    self._invalidate_issues_cache()
                self._emit(
                    "upload-done",
                    {
                        "job_id": job_id,
                        "succeeded": len(succeeded_ids),
                        "failed": failed,
                        "remaining_queue": self.get_upload_queue(),
                    },
                )

        threading.Thread(target=worker, daemon=True).start()
        return job_id

    # -- Раздел 11/12: настройки, диалоги ---------------------------------------

    def open_settings(self) -> dict:
        return {
            "masked_token": self.has_saved_token_masked(),
            "download_default_folder": self._settings.settings.download_default_folder,
        }

    def set_download_default_folder(self, folder: str) -> None:
        self._settings.update(download_default_folder=folder)


def _item_to_dict(item: UploadItem) -> dict:
    return {
        "id": item.id,
        "source_path": item.source_path,
        "original_filename": item.original_filename,
        "title": item.title,
        "body": item.body,
        "content_hash": item.content_hash,
        "labels": item.labels,
        "error": item.error,
    }


def _item_from_dict(d: dict) -> UploadItem:
    return UploadItem(
        id=d["id"],
        source_path=d["source_path"],
        original_filename=d["original_filename"],
        title=d["title"],
        body=d["body"],
        content_hash=d["content_hash"],
        labels=d.get("labels", []),
        error=d.get("error"),
    )
