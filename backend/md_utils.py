"""
Чтение исходных Markdown-файлов для Upload-очереди (раздел 6).

- UTF-8 с автоматическим определением допустимых вариантов (UTF-8, UTF-8 с
  BOM, UTF-16 LE/BE с BOM - это единственные варианты, для которых можно
  надёжно, без гадания, определить кодировку по байтовой сигнатуре).
- BOM корректно обрабатывается (удаляется, не попадает в содержимое).
- Unicode-символы и форматирование Markdown не изменяются - никакой
  нормализации/трансформации текста, кроме удаления BOM.
- Максимальный размер файла - 1 000 000 символов (после декодирования).
- Бинарные/нечитаемые данные не поддерживаются.
"""
from __future__ import annotations

MAX_MARKDOWN_CHARS = 1_000_000

_BOM_UTF8 = b"\xef\xbb\xbf"
_BOM_UTF16_LE = b"\xff\xfe"
_BOM_UTF16_BE = b"\xfe\xff"


class MarkdownReadError(ValueError):
    pass


class MarkdownTooLargeError(MarkdownReadError):
    pass


class MarkdownNotReadableError(MarkdownReadError):
    pass


def _looks_binary(data: bytes) -> bool:
    # NUL-байт практически никогда не встречается в текстовых файлах и
    # является надёжным быстрым признаком бинарных данных.
    return b"\x00" in data


def decode_markdown_bytes(data: bytes) -> str:
    if data.startswith(_BOM_UTF8):
        text = data[len(_BOM_UTF8):].decode("utf-8")
    elif data.startswith(_BOM_UTF16_LE):
        text = data.decode("utf-16-le").lstrip("\ufeff")
    elif data.startswith(_BOM_UTF16_BE):
        text = data.decode("utf-16-be").lstrip("\ufeff")
    else:
        # Без BOM: NUL-байт - надёжный признак бинарных данных только в
        # предполагаемой UTF-8/однобайтовой кодировке.
        if _looks_binary(data):
            raise MarkdownNotReadableError("Файл не является текстовым (обнаружены бинарные данные)")
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise MarkdownNotReadableError(
                f"Не удалось определить кодировку файла: {exc}"
            ) from exc

    if len(text) > MAX_MARKDOWN_CHARS:
        raise MarkdownTooLargeError(
            f"Файл превышает лимит в {MAX_MARKDOWN_CHARS} символов"
        )
    return text


def read_markdown_file(path: str) -> str:
    try:
        with open(path, "rb") as f:
            data = f.read()
    except OSError as exc:
        raise MarkdownNotReadableError(f"Не удалось прочитать файл: {exc}") from exc
    return decode_markdown_bytes(data)
