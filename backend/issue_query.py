"""
Локальные state/labels/поиск/сортировка/пагинация над УЖЕ ограниченным набором
issues (замыканием зависимостей). Применяется только там, где GitHub не умеет
серверно отфильтровать произвольный набор номеров (см. dependency_listing);
для обычного списка репозитория остаётся серверная фильтрация.

Семантика повторяет серверную: несколько labels - логическое И, состояние
open/closed/all, сортировка по created/updated/comments.
"""
from __future__ import annotations

from collections.abc import Iterable

from github_client import (
    SUPPORTED_DIRECTIONS,
    SUPPORTED_SORT_FIELDS,
    SUPPORTED_STATES,
    Issue,
)

_SORT_KEYS = {
    "created": lambda i: i.created_at,
    "updated": lambda i: i.updated_at,
    "comments": lambda i: i.comments,
}


def validate_query_params(state: str, sort: str, direction: str) -> None:
    if state not in SUPPORTED_STATES:
        raise ValueError(f"Unsupported state: {state}")
    if sort not in SUPPORTED_SORT_FIELDS:
        raise ValueError(f"Unsupported sort: {sort}")
    if direction not in SUPPORTED_DIRECTIONS:
        raise ValueError(f"Unsupported direction: {direction}")


def query_issues(
    issues: Iterable[Issue],
    *,
    state: str,
    labels: list[str] | None,
    search: str | None,
    sort: str,
    direction: str,
    page: int,
    per_page: int,
) -> list[Issue]:
    """Pre: page >= 1, per_page >= 1, state/sort/direction поддерживаются.
    Post: порядок детерминирован (при равных ключах - по номеру issue в том же
    направлении)."""
    validate_query_params(state, sort, direction)
    wanted_labels = {name.casefold() for name in labels or ()}
    terms = (search or "").casefold().split()

    matching = [
        issue
        for issue in issues
        if (state == "all" or issue.state == state)
        and wanted_labels <= {label.name.casefold() for label in issue.labels}
        and all(term in issue.title.casefold() for term in terms)
    ]
    sort_key = _SORT_KEYS[sort]
    matching.sort(key=lambda i: (sort_key(i), i.number), reverse=direction == "desc")
    start = (page - 1) * per_page
    return matching[start : start + per_page]
