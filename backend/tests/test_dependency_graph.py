import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from dependency_graph import (
    BLOCKED_BY,
    BLOCKING,
    CONNECTED,
    DEPENDENCIES,
    DEPENDENTS,
    RELATES,
    RELATES_TO,
    collect_closure,
)


class FakeGraph:
    """Граф связей. `depends_on[a] = [b, ...]` означает «a зависит от b» (на
    GitHub: a blocked_by b, b blocking a). `relates[a] = [b, ...]` - связь
    «relates to»; она симметрична, как на GitHub: видна с обеих сторон.
    Считает обращения, чтобы тесты могли проверять, что узлы не запрашиваются
    повторно. `repeat` дублирует каждого соседа (повторы на границах страниц)."""

    def __init__(self, depends_on, relates=None, repeat=False):
        self.depends_on = depends_on
        self.relates = relates or {}
        self.repeat = repeat
        self.calls = []

    def neighbors(self, number, direction):
        self.calls.append((number, direction))
        if direction == BLOCKED_BY:
            found = list(self.depends_on.get(number, []))
        elif direction == BLOCKING:
            found = [n for n, deps in self.depends_on.items() if number in deps]
        else:
            assert direction == RELATES
            found = list(self.relates.get(number, [])) + [
                n for n, linked in self.relates.items() if number in linked
            ]
        return found * 2 if self.repeat else found


def closure(depends_on, start, mode, relates=None, repeat=False):
    graph = FakeGraph(depends_on, relates, repeat)
    return collect_closure(start, mode, graph.neighbors)


# -- режимы ---------------------------------------------------------------

CHAIN = {4: [3], 3: [2], 2: [1]}  # 4 -> 3 -> 2 -> 1 (стрелка = «зависит от»)


def test_dependencies_mode_returns_direct_and_transitive_prerequisites():
    assert closure(CHAIN, 3, DEPENDENCIES) == {2, 1}


def test_dependents_mode_returns_direct_and_transitive_followers():
    assert closure(CHAIN, 3, DEPENDENTS) == {4}
    assert closure(CHAIN, 1, DEPENDENTS) == {2, 3, 4}


def test_relates_to_mode_follows_relates_to_links_transitively_in_both_directions():
    relates = {1: [2], 2: [3]}  # 1 - 2 - 3
    assert closure({}, 2, RELATES_TO, relates) == {1, 3}
    assert closure({}, 1, RELATES_TO, relates) == {2, 3}
    assert closure({}, 3, RELATES_TO, relates) == {1, 2}


def test_relates_to_mode_ignores_dependency_links():
    assert closure(CHAIN, 3, RELATES_TO) == set()


def test_dependency_modes_ignore_relates_to_links():
    relates = {3: [9]}
    assert closure(CHAIN, 3, DEPENDENCIES, relates) == {2, 1}
    assert closure(CHAIN, 3, DEPENDENTS, relates) == {4}


def test_connected_mode_is_union_of_all_three_links():
    # 2 зависит от 1, от 2 зависит 4, 2 связана (relates to) с 3, а 3 - с 5
    depends_on = {2: [1], 4: [2]}
    relates = {2: [3], 3: [5]}
    assert closure(depends_on, 2, CONNECTED, relates) == {1, 3, 4, 5}


def test_selected_issue_is_never_in_result():
    relates = {3: [2], 4: [3]}  # у выбранного есть и симметричные связи
    for mode in (DEPENDENCIES, DEPENDENTS, RELATES_TO, CONNECTED):
        assert 3 not in closure(CHAIN, 3, mode, relates)


def test_issue_without_links_gives_empty_result():
    for mode in (DEPENDENCIES, DEPENDENTS, RELATES_TO, CONNECTED):
        assert closure({}, 7, mode) == set()


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


def test_issue_reachable_through_several_kinds_of_links_appears_once():
    # 1 одновременно: зависимость 2, зависимый от 2 и связанная с 2 через relates to
    depends_on = {2: [1], 1: []}
    relates = {2: [1]}
    result = collect_closure(2, CONNECTED, FakeGraph(depends_on, relates).neighbors)
    assert sorted(result) == [1]


def test_neighbors_repeated_by_the_source_are_expanded_once_and_listed_once():
    graph = FakeGraph(DIAMOND, {5: [7]}, repeat=True)
    result = collect_closure(5, CONNECTED, graph.neighbors)
    assert sorted(result) == [1, 3, 4, 7]
    assert len(graph.calls) == len(set(graph.calls))


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
@pytest.mark.parametrize("mode", [DEPENDENCIES, CONNECTED])
def test_cycle_among_dependencies_is_detected_by_assert(depends_on, start, mode):
    with pytest.raises(AssertionError, match="цикл зависимостей"):
        closure(depends_on, start, mode)


@pytest.mark.parametrize("mode", [DEPENDENTS, CONNECTED])
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
        collect_closure(1, CONNECTED, failing)


# -- relates to симметрична: циклы допустимы и не считаются ошибкой --------------

@pytest.mark.parametrize(
    "relates,start,expected",
    [
        ({1: [2]}, 1, {2}),  # A <-> B: каждая сторона видит другую
        ({1: [2], 2: [3], 3: [1]}, 1, {2, 3}),  # треугольник
        ({1: [1]}, 1, set()),  # связь issue с самим собой
        ({1: [2], 2: [1]}, 1, {2}),  # связь, отданная с обеих сторон
    ],
)
@pytest.mark.parametrize("mode", [RELATES_TO, CONNECTED])
def test_cycles_among_relates_to_links_are_not_errors(relates, start, expected, mode):
    assert closure({}, start, mode, relates) == expected


def test_relates_to_cycle_does_not_hide_a_dependency_cycle_in_connected_mode():
    with pytest.raises(AssertionError, match="цикл зависимостей"):
        closure({1: [2], 2: [1]}, 1, CONNECTED, {1: [3], 3: [1]})
