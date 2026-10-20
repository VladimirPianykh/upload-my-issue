import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from dependency_graph import (
    BLOCKED_BY,
    BLOCKING,
    DEPENDENCIES,
    DEPENDENTS,
    RELATED,
    collect_closure,
)


class FakeGraph:
    """Граф зависимостей: `depends_on[a] = [b, ...]` означает «a зависит от b»
    (на GitHub: a blocked_by b, b blocking a). Считает обращения, чтобы тесты
    могли проверять, что узлы не запрашиваются повторно."""

    def __init__(self, depends_on):
        self.depends_on = depends_on
        self.calls = []

    def neighbors(self, number, direction):
        self.calls.append((number, direction))
        if direction == BLOCKED_BY:
            return list(self.depends_on.get(number, []))
        assert direction == BLOCKING
        return [n for n, deps in self.depends_on.items() if number in deps]


def closure(depends_on, start, mode):
    return collect_closure(start, mode, FakeGraph(depends_on).neighbors)


# -- режимы ---------------------------------------------------------------

CHAIN = {4: [3], 3: [2], 2: [1]}  # 4 -> 3 -> 2 -> 1 (стрелка = «зависит от»)


def test_dependencies_mode_returns_direct_and_transitive_prerequisites():
    assert closure(CHAIN, 3, DEPENDENCIES) == {2, 1}


def test_dependents_mode_returns_direct_and_transitive_followers():
    assert closure(CHAIN, 3, DEPENDENTS) == {4}
    assert closure(CHAIN, 1, DEPENDENTS) == {2, 3, 4}


def test_related_mode_is_union_of_dependencies_and_dependents():
    assert closure(CHAIN, 3, RELATED) == {1, 2, 4}


def test_selected_issue_is_never_in_result():
    for mode in (DEPENDENCIES, DEPENDENTS, RELATED):
        assert 3 not in closure(CHAIN, 3, mode)


def test_issue_without_links_gives_empty_result():
    assert closure({}, 7, RELATED) == set()


def test_unknown_mode_is_rejected():
    with pytest.raises(ValueError):
        closure(CHAIN, 3, "bogus")


# -- повторные пути и запросы ---------------------------------------------

DIAMOND = {5: [3, 4], 3: [1], 4: [1]}  # два пути 5 -> 1 - это не цикл


def test_issue_reachable_by_several_paths_appears_once_and_is_not_a_cycle():
    assert closure(DIAMOND, 5, DEPENDENCIES) == {3, 4, 1}


def test_every_node_is_requested_at_most_once_per_direction():
    graph = FakeGraph(DIAMOND)
    collect_closure(5, DEPENDENCIES, graph.neighbors)
    assert len(graph.calls) == len(set(graph.calls))
    assert {call[0] for call in graph.calls} == {5, 3, 4, 1}


def test_long_chain_does_not_hit_recursion_limit():
    chain = {n: [n - 1] for n in range(2, 5001)}
    assert len(closure(chain, 5000, DEPENDENCIES)) == 4999


# -- циклы (раздел 5: обнаружение через assert) ----------------------------

@pytest.mark.parametrize(
    "depends_on,start",
    [
        ({1: [1]}, 1),  # self-loop
        ({1: [2], 2: [1]}, 1),  # цикл через выбранный issue
        ({3: [1], 1: [2], 2: [1]}, 3),  # цикл, в который обход входит снаружи
        ({1: [2], 2: [3], 3: [4], 4: [2]}, 1),  # длинный цикл вдали от start
    ],
)
@pytest.mark.parametrize("mode", [DEPENDENCIES, RELATED])
def test_cycle_among_dependencies_is_detected_by_assert(depends_on, start, mode):
    with pytest.raises(AssertionError, match="цикл зависимостей"):
        closure(depends_on, start, mode)


@pytest.mark.parametrize("mode", [DEPENDENTS, RELATED])
def test_cycle_among_dependents_is_detected_by_assert(mode):
    # 2 и 3 зависят друг от друга, оба достижимы «вниз» от 1.
    with pytest.raises(AssertionError, match="цикл зависимостей"):
        closure({2: [1, 3], 3: [2]}, 1, mode)


def test_cycle_in_the_other_direction_is_not_traversed_and_not_reported():
    # Цикл 2 <-> 3 лежит среди зависимых от 1; режим «Зависимости» туда не идёт.
    assert closure({2: [1, 3], 3: [2]}, 1, DEPENDENCIES) == set()


def test_cycle_unreachable_from_selected_issue_is_ignored():
    assert closure({1: [], 5: [6], 6: [5]}, 1, DEPENDENCIES) == set()


def test_fetch_errors_abort_the_traversal_unchanged():
    def failing(number, direction):
        raise RuntimeError("network down")

    with pytest.raises(RuntimeError, match="network down"):
        collect_closure(1, RELATED, failing)
