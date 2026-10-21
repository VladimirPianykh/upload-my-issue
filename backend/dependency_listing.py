"""
Список issues с фильтрами зависимостей (Dependency filter.md).

Алгоритм:
1. Для каждого фильтра зависимостей считается замыкание (dependency_graph) по
   ВСЕМ issues - остальные фильтры на обход не влияют (раздел 1).
2. Замыкания нескольких фильтров пересекаются.
3. К полученному набору локально применяются state/labels/поиск/сортировка/
   страница (issue_query): GitHub не умеет фильтровать список по набору номеров,
   а набор уже ограничен зависимостями, а не всем репозиторием.

Кэш хранит прямых соседей и сами issues (их возвращают эндпоинты зависимостей),
поэтому смена страницы или параметров сортировки не повторяет запросы к GitHub
до `invalidate()`.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from dependency_graph import collect_closure
from github_client import Issue
from issue_query import query_issues, validate_query_params


class DependencyCycleError(RuntimeError):
    """В обходимом графе зависимостей найден цикл (раздел 5)."""


@dataclass(frozen=True)
class DependencyFilter:
    mode: str  # DEPENDENCIES | DEPENDENTS | RELATED из dependency_graph
    number: int


class DependencyClient(Protocol):
    def list_issue_dependencies(self, owner: str, repo: str, number: int, direction: str) -> list[Issue]: ...


class DependencyIssueLister:
    # Публичный `list` объявлен последним: имя метода затеняет встроенный `list`
    # в области класса, а аннотации остальных методов должны ссылаться на него.
    def __init__(self, client: DependencyClient):
        self._client = client
        self._neighbors: dict[tuple[str, str, int, str], list[int]] = {}
        self._issues: dict[tuple[str, str, int], Issue] = {}

    def invalidate(self) -> None:
        self._neighbors.clear()
        self._issues.clear()

    def _neighbors_of(self, owner: str, repo: str, number: int, link_direction: str) -> list[int]:
        key = (owner, repo, number, link_direction)
        if key not in self._neighbors:
            issues = self._client.list_issue_dependencies(owner, repo, number, link_direction)
            for issue in issues:
                self._issues[(owner, repo, issue.number)] = issue
            self._neighbors[key] = [issue.number for issue in issues]
        return self._neighbors[key]

    def _closure_of(self, owner: str, repo: str, dependency_filter: DependencyFilter) -> set[int]:
        def neighbors(number: int, link_direction: str) -> list[int]:
            return self._neighbors_of(owner, repo, number, link_direction)

        try:
            return collect_closure(dependency_filter.number, dependency_filter.mode, neighbors)
        except AssertionError as exc:
            raise DependencyCycleError(str(exc)) from exc

    def list(
        self,
        owner: str,
        repo: str,
        filters: list[DependencyFilter],
        *,
        state: str,
        labels: list[str] | None,
        sort: str,
        direction: str,
        search: str | None,
        page: int,
        per_page: int,
    ) -> list[Issue]:
        """Pre: `filters` не пуст. Любое исключение обхода прерывает вычисление
        и пробрасывается как есть; цикл - DependencyCycleError."""
        if not filters:
            raise ValueError("At least one dependency filter is required")
        validate_query_params(state, sort, direction)

        numbers = set.intersection(*(self._closure_of(owner, repo, f) for f in filters))
        return query_issues(
            (self._issues[(owner, repo, n)] for n in numbers),
            state=state,
            labels=labels,
            search=search,
            sort=sort,
            direction=direction,
            page=page,
            per_page=per_page,
        )
