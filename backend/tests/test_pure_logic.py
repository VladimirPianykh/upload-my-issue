import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from url_parser import parse_repo_url, InvalidRepoUrlError
from filename_utils import (
    derive_title_from_filename,
    strip_markdown_extension,
    build_download_filename,
)
from md_utils import decode_markdown_bytes, MarkdownTooLargeError, MarkdownNotReadableError
from upload_queue import UploadItem, find_duplicate


# -- url_parser -----------------------------------------------------------

@pytest.mark.parametrize(
    "raw,expected",
    [
        ("https://github.com/owner/repo", ("owner", "repo")),
        ("https://github.com/owner/repo/", ("owner", "repo")),
        ("https://github.com/owner/repo.git", ("owner", "repo")),
        ("http://github.com/owner/repo.git", ("owner", "repo")),
        ("github.com/owner/repo", ("owner", "repo")),
        ("www.github.com/owner/repo", ("owner", "repo")),
        ("https://github.com/owner/repo/issues", ("owner", "repo")),
        ("https://github.com/owner/repo/issues/123", ("owner", "repo")),
        ("git@github.com:owner/repo.git", ("owner", "repo")),
        ("  https://github.com/owner/repo  ", ("owner", "repo")),
    ],
)
def test_parse_repo_url_valid(raw, expected):
    ref = parse_repo_url(raw)
    assert (ref.owner, ref.repo) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "not a url",
        "https://gitlab.com/owner/repo",
        "https://github.com/owner/../../etc/passwd",
        "https://github.com/owner/repo/../other",
        "https://github.com/owner",
        "https://github.com/-owner/repo",
        "https://github.com/owner/repo\x00.git",
        "https://github.com/owner\\repo",
    ],
)
def test_parse_repo_url_invalid(raw):
    with pytest.raises(InvalidRepoUrlError):
        parse_repo_url(raw)


# -- filename_utils: title derivation (раздел 7) ---------------------------

def test_title_with_space_keeps_dash_and_underscore():
    assert derive_title_from_filename("my cool_file-name") == "my cool_file-name"


def test_title_no_space_underscore_to_space():
    assert derive_title_from_filename("my_cool_file-name") == "my cool file-name"


def test_title_no_space_no_underscore_dash_to_space():
    assert derive_title_from_filename("my-cool-file") == "my cool file"


def test_strip_extension():
    assert strip_markdown_extension("Notes.MD") == "Notes"
    assert strip_markdown_extension("Notes.markdown") == "Notes"


# -- filename_utils: download filename (раздел 5) --------------------------

def test_build_download_filename_basic():
    assert build_download_filename(42, "Hello World") == "42-Hello World.md"


def test_build_download_filename_sanitizes_invalid_chars():
    name = build_download_filename(1, 'Bad:Name/With*Chars?')
    assert name.startswith("1-")
    assert name.endswith(".md")
    for ch in '<>:"/\\|?*':
        assert ch not in name


def test_build_download_filename_reserved_name():
    name = build_download_filename(1, "CON")
    assert not name[len("1-"):-len(".md")].upper() == "CON"


def test_build_download_filename_length_limit():
    long_title = "A" * 500
    name = build_download_filename(7, long_title)
    assert len(name) <= 210


# -- md_utils ---------------------------------------------------------------

def test_decode_utf8_bom_stripped():
    data = b"\xef\xbb\xbfHello"
    assert decode_markdown_bytes(data) == "Hello"


def test_decode_utf16_le_bom():
    data = "Hello".encode("utf-16-le")
    data = b"\xff\xfe" + data
    assert decode_markdown_bytes(data) == "Hello"


def test_decode_too_large():
    data = ("a" * 1_000_001).encode("utf-8")
    with pytest.raises(MarkdownTooLargeError):
        decode_markdown_bytes(data)


def test_decode_binary_rejected():
    with pytest.raises(MarkdownNotReadableError):
        decode_markdown_bytes(b"\x00\x01\x02binary")


# -- upload_queue duplicate detection (раздел 8) ----------------------------

def _item(title, body, path="a.md"):
    import hashlib
    return UploadItem(
        id="x",
        source_path=path,
        original_filename=path,
        title=title,
        body=body,
        content_hash=hashlib.sha256(body.encode("utf-8")).hexdigest(),
    )


def test_duplicate_requires_both_title_and_hash():
    existing = _item("Same Title", "same body", path="/a/one.md")
    same_everything = _item("Same Title", "same body", path="/b/two.md")
    same_title_diff_body = _item("Same Title", "different body")
    diff_title_same_body = _item("Other Title", "same body")

    queue = [existing]
    assert find_duplicate(queue, same_everything) is existing
    assert find_duplicate(queue, same_title_diff_body) is None
    assert find_duplicate(queue, diff_title_same_body) is None
