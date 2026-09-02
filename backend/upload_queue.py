"""
Upload-очередь (разделы 6, 8): элементы, дедупликация, рекурсивный поиск
Markdown-файлов в добавляемых папках.
"""
from __future__ import annotations

import hashlib
import os
import uuid
from dataclasses import dataclass, field

from filename_utils import derive_title_from_filename, strip_markdown_extension
from md_utils import read_markdown_file

_SUPPORTED_EXTENSIONS = (".md", ".markdown")


@dataclass
class UploadItem:
    id: str
    source_path: str
    original_filename: str
    title: str
    body: str
    content_hash: str
    labels: list[str] = field(default_factory=list)
    error: str | None = None

    @staticmethod
    def from_file(path: str) -> "UploadItem":
        body = read_markdown_file(path)
        original_filename = os.path.basename(path)
        stem = strip_markdown_extension(original_filename)
        title = derive_title_from_filename(stem)
        content_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()
        return UploadItem(
            id=str(uuid.uuid4()),
            source_path=path,
            original_filename=original_filename,
            title=title,
            body=body,
            content_hash=content_hash,
        )


class DuplicateAction:
    REPLACE = "replace"
    KEEP_BOTH = "keep_both"
    SKIP = "skip"


def find_duplicate(queue: list[UploadItem], candidate: UploadItem) -> UploadItem | None:
    """Раздел 8: дубликат = совпадение title в очереди И хеша содержимого.

    Путь к файлу в сравнении не участвует.
    """
    for existing in queue:
        if existing.title == candidate.title and existing.content_hash == candidate.content_hash:
            return existing
    return None


def is_supported_markdown(filename: str) -> bool:
    return filename.lower().endswith(_SUPPORTED_EXTENSIONS)


@dataclass
class ScanResult:
    files: list[str]
    unreadable_dirs: list[str]
    skipped_non_markdown: list[str]


def scan_paths_for_markdown(paths: list[str]) -> ScanResult:
    """Рекурсивно ищет .md/.markdown файлы среди переданных путей (файлов и
    папок), никогда не переходя по симлинкам/junction'ам.

    - Файлы, не являющиеся .md/.markdown, попадают в skipped_non_markdown
      (не приводят к ошибке).
    - Недоступные при обходе папки собираются в unreadable_dirs - вызывающий
      код должен предложить пользователю Retry/Skip/Apply to all (раздел 6),
      это UI-логика и в этой функции не реализуется.
    """
    found: list[str] = []
    unreadable_dirs: list[str] = []
    skipped: list[str] = []

    for p in paths:
        if os.path.islink(p):
            # Симлинк на файл или папку верхнего уровня - принципиально не
            # обходится (раздел 6).
            continue
        if os.path.isdir(p):
            _scan_dir(p, found, unreadable_dirs, skipped)
        elif os.path.isfile(p):
            if is_supported_markdown(p):
                found.append(p)
            else:
                skipped.append(p)
        else:
            skipped.append(p)

    return ScanResult(files=found, unreadable_dirs=unreadable_dirs, skipped_non_markdown=skipped)


def rescan_single_directory(directory: str) -> ScanResult:
    """Повторная попытка обхода ровно одной директории (Retry-сценарий раздела 6)."""
    found: list[str] = []
    unreadable_dirs: list[str] = []
    skipped: list[str] = []
    _scan_dir(directory, found, unreadable_dirs, skipped)
    return ScanResult(files=found, unreadable_dirs=unreadable_dirs, skipped_non_markdown=skipped)


def _scan_dir(directory: str, found: list[str], unreadable_dirs: list[str], skipped: list[str]) -> None:
    try:
        entries = list(os.scandir(directory))
    except OSError:
        unreadable_dirs.append(directory)
        return

    for entry in entries:
        if entry.is_symlink():
            # Симлинки/junction'ы принципиально не обходятся.
            continue
        try:
            if entry.is_dir(follow_symlinks=False):
                _scan_dir(entry.path, found, unreadable_dirs, skipped)
            elif entry.is_file(follow_symlinks=False):
                if is_supported_markdown(entry.name):
                    found.append(entry.path)
                else:
                    skipped.append(entry.path)
        except OSError:
            unreadable_dirs.append(entry.path)
