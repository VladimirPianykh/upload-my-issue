"""
Обход графа зависимостей issue (Dependency filter.md, раздел 1).

Модуль чистый: сам граф недоступен напрямую, его рёбра запрашиваются через
функцию `get_neighbors(number, direction)` - это граница с GitHub API.

Терминология GitHub - направления связей (то, что запрашивается у API):
- BLOCKED_BY: issues, от которых зависит данный (его «зависимости»);
- BLOCKING: issues, которые зависят от данного (его «зависимые»);
- RELATES: связь «relates to». В отличие от двух предыдущих она симметрична
  (видна с обеих сторон), поэтому «циклы» в ней - норма: проверка циклов к ней
  не применяется, обход - обычная компонента связности.
"""
from __future__ import annotations

from collections.abc import Callable, Iterable

BLOCKED_BY = "blocked_by"
BLOCKING = "blocking"
RELATES = "relates"

# Режимы фильтра: !dep#, !idep#, !rel# (relates to) и !con# (любая из трёх связей).
DEPENDENCIES = "dependencies"
DEPENDENTS = "dependents"
RELATES_TO = "relates_to"
CONNECTED = "connected"

_DIRECTIONS_BY_MODE = {
    DEPENDENCIES: (BLOCKED_BY,),
    DEPENDENTS: (BLOCKING,),
    RELATES_TO: (RELATES,),
    CONNECTED: (BLOCKED_BY, BLOCKING, RELATES),
}
_SYMMETRIC_DIRECTIONS = frozenset({RELATES})

NeighborsFetcher = Callable[[int, str], Iterable[int]]


def collect_closure(start: int, mode: str, get_neighbors: NeighborsFetcher) -> set[int]:
    """Номера всех issues, достижимых от `start` по зависимостям в режиме
    `mode`, без самого `start`.

    Pre: `mode` - одно из DEPENDENCIES/DEPENDENTS/RELATES_TO/CONNECTED.
    Post: результат не содержит `start`, каждый номер встречается один раз
    (в том числе если он достижим несколькими путями или разными связями).
    Цикл среди направленных связей (BLOCKED_BY, BLOCKING) - AssertionError.
    """
    if mode not in _DIRECTIONS_BY_MODE:
        raise ValueError(f"Unsupported dependency filter mode: {mode}")

    result: set[int] = set()
    for direction in _DIRECTIONS_BY_MODE[mode]:
        walk = _component if direction in _SYMMETRIC_DIRECTIONS else _reachable
        result |= walk(start, direction, get_neighbors)
    result.discard(start)
    return result


def _describe_cycle(path: list[int], repeated: int) -> str:
    """Текст ошибки: часть текущего пути, замкнувшаяся на `repeated`."""
    cycle = [*path[path.index(repeated):], repeated]
    return "Обнаружен цикл зависимостей: " + " -> ".join(map(str, cycle))


def _component(start: int, direction: str, get_neighbors: NeighborsFetcher) -> set[int]:
    """Компонента связности по симметричной связи (включая `start`): множество
    посещённых исключает повторные запросы узлов и повторы соседей."""
    seen = {start}
    pending = [start]
    while pending:
        for neighbor in get_neighbors(pending.pop(), direction):
            if neighbor not in seen:
                seen.add(neighbor)
                pending.append(neighbor)
    return seen


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
