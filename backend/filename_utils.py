"""
Реализует два независимых набора правил из спецификации:

1) derive_title_from_filename() - раздел 7 "Определение title при Upload".
2) build_download_filename()    - раздел 5 "Формат Download".
"""
from __future__ import annotations

import re

# Символы, недопустимые в именах файлов Windows: управляющие 0x00-0x1F и
# < > : " / \ | ? *
_WINDOWS_INVALID_CHARS_RE = re.compile(r'[<>:"/\\|?*\x00-\x1f]')

# Универсальный видимый заполнитель для недопустимых символов.
_PLACEHOLDER_CHAR = "_"

_RESERVED_WINDOWS_NAMES = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}

# Практический предел длины компонента пути в Windows (255 символов у NTFS,
# берём с запасом под "номер-" префикс и ".md").
_MAX_FILENAME_LENGTH = 200


def derive_title_from_filename(filename_without_ext: str) -> str:
    """Раздел 7: default title из имени файла (без расширения).

    - URL-символы не декодируются (ничего не делаем с %XX).
    - Если есть пробел -> '-' и '_' не трогаем.
    - Иначе если есть '_' -> все '_' -> ' ', '-' не трогаем.
    - Иначе -> все '-' -> ' '.
    """
    name = filename_without_ext
    if " " in name:
        return name
    if "_" in name:
        return name.replace("_", " ")
    return name.replace("-", " ")


def strip_markdown_extension(filename: str) -> str:
    """Убирает .md/.markdown (регистронезависимо) с конца имени файла."""
    for ext in (".markdown", ".md"):
        if filename.lower().endswith(ext):
            return filename[: -len(ext)]
    return filename


def _sanitize_title_for_filename(title: str) -> str:
    sanitized = _WINDOWS_INVALID_CHARS_RE.sub(_PLACEHOLDER_CHAR, title)
    # Windows не допускает завершающие пробелы/точки в имени компонента пути.
    sanitized = sanitized.rstrip(" .")
    if not sanitized:
        sanitized = _PLACEHOLDER_CHAR
    stem = sanitized.split(".", 1)[0].upper()
    if stem in _RESERVED_WINDOWS_NAMES:
        sanitized = f"{_PLACEHOLDER_CHAR}{sanitized}"
    return sanitized


def build_download_filename(issue_number: int, title: str) -> str:
    """Раздел 5: имя файла вида '{номер}-{title}.md'.

    Гарантирует валидный для Windows компонент пути и ограничивает общую
    длину, обрезая title при необходимости (не сам путь целиком).
    """
    prefix = f"{issue_number}-"
    suffix = ".md"
    sanitized_title = _sanitize_title_for_filename(title)

    budget = _MAX_FILENAME_LENGTH - len(prefix) - len(suffix)
    if budget < 1:
        budget = 1
    if len(sanitized_title) > budget:
        sanitized_title = sanitized_title[:budget].rstrip(" .")
        if not sanitized_title:
            sanitized_title = _PLACEHOLDER_CHAR

    return f"{prefix}{sanitized_title}{suffix}"
