"""
Обход графа зависимостей issue (Dependency filter.md, раздел 1).

Модуль чистый: сам граф недоступен напрямую, его рёбра запрашиваются через
функцию `get_neighbors(number, direction)` - это граница с GitHub API.

Терминология GitHub (issue dependencies):
- BLOCKED_BY: issues, от которых зависит данный (его «зависимости»);
- BLOCKING: issues, которые зависят от данного (его «зависимые»).
"""
from __future__ import annotations

from collections.abc import Callable, Iterable

BLOCKED_BY = "blocked_by"
BLOCKING = "blocking"

# Режимы фильтра (Dependency filter.md: `Зависимости`, `Зависимые`, `Связанные`).
DEPENDENCIES = "dependencies"
DEPENDENTS = "dependents"
RELATED = "related"

_DIRECTIONS_BY_MODE = {
    DEPENDENCIES: (BLOCKED_BY,),
    DEPENDENTS: (BLOCKING,),
    RELATED: (BLOCKED_BY, BLOCKING),
}

NeighborsFetcher = Callable[[int, str], Iterable[int]]


def collect_closure(start: int, mode: str, get_neighbors: NeighborsFetcher) -> set[int]:
    """Номера всех issues, достижимых от `start` по зависимостям в режиме
    `mode`, без самого `start`.

    Pre: `mode` - одно из DEPENDENCIES/DEPENDENTS/RELATED.
    Post: результат не содержит `start`, каждый номер встречается один раз.
    """
    if mode not in _DIRECTIONS_BY_MODE:
        raise ValueError(f"Unsupported dependency filter mode: {mode}")

    result: set[int] = set()
    for direction in _DIRECTIONS_BY_MODE[mode]:
        result |= _reachable(start, direction, get_neighbors)
    result.discard(start)
    return result


def _describe_cycle(path: list[int], repeated: int) -> str:
    """Текст ошибки: часть текущего пути, замкнувшаяся на `repeated`."""
    cycle = [*path[path.index(repeated):], repeated]
    return "Обнаружен цикл зависимостей: " + " -> ".join(map(str, cycle))


def _reachable(start: int, direction: str, get_neighbors: NeighborsFetcher) -> set[int]:
    """Итеративный DFS с отслеживанием текущего пути: возврат на узел пути -
    цикл (раздел 5: обнаруживается через assert). Повторный заход в уже
    полностью обойдённый узел (ромб) циклом не является и пропускается, поэтому
    каждый узел запрашивается ровно один раз."""
    path = [start]
    on_path = {start}
    finished: set[int] = set()
    stack = [iter(get_neighbors(start, direction))]
    while stack:
        for neighbor in stack[-1]:
            assert neighbor not in on_path, _describe_cycle(path, neighbor)
            if neighbor in finished:
                continue
            path.append(neighbor)
            on_path.add(neighbor)
            stack.append(iter(get_neighbors(neighbor, direction)))
            break
        else:
            stack.pop()
            node = path.pop()
            on_path.discard(node)
            finished.add(node)
    return finished
