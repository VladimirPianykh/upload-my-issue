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
)
from dependency_listing import DependencyCycleError, DependencyFilter, DependencyIssueLister
from github_client import Issue, Label


def make_issue(number, *, state="open", labels=(), title=None, comments=0, day=None):
    day = day or number
    return Issue(
        number=number,
        title=title or f"Issue {number}",
        body=f"body {number}",
        state=state,
        labels=[Label(name=n, color="ffffff") for n in labels],
        html_url=f"https://github.com/octo/hello/issues/{number}",
        is_pull_request=False,
        created_at=f"2026-01-{day:02d}T00:00:00Z",
        updated_at=f"2026-02-{day:02d}T00:00:00Z",
        comments=comments,
    )


class FakeGitHub:
    """Фейк GitHub dependencies API. `depends_on[a] = [b]`: a зависит от b.
    `relates[a] = [b]`: связь relates to, симметричная, как на GitHub."""

    def __init__(self, issues, depends_on, relates=None):
        self.issues = {i.number: i for i in issues}
        self.depends_on = depends_on
        self.relates = relates or {}
        self.calls = []

    def list_issue_dependencies(self, owner, repo, number, direction):
        self.calls.append((owner, repo, number, direction))
        if direction == BLOCKED_BY:
            numbers = self.depends_on.get(number, [])
        elif direction == BLOCKING:
            numbers = [n for n, deps in self.depends_on.items() if number in deps]
        else:
            assert direction == RELATES
            numbers = list(self.relates.get(number, [])) + [
                n for n, linked in self.relates.items() if number in linked
            ]
        return [self.issues[n] for n in numbers]


CHAIN = {4: [3], 3: [2], 2: [1]}  # 4 -> 3 -> 2 -> 1


def listing(depends_on=CHAIN, issues=None, filters=(), relates=None, **query):
    issues = issues or [make_issue(n) for n in range(1, 6)]
    github = FakeGitHub(issues, depends_on, relates)
    lister = DependencyIssueLister(github)
    params = dict(state="all", labels=None, sort="created", direction="desc", search=None, page=1, per_page=10)
    params.update(query)
    result = lister.list("octo", "hello", list(filters), **params)
    return [i.number for i in result]


def dep(mode, number):
    return DependencyFilter(mode=mode, number=number)


# -- режимы и пересечение --------------------------------------------------

def test_dependencies_filter_lists_transitive_prerequisites():
    assert listing(filters=[dep(DEPENDENCIES, 4)]) == [3, 2, 1]


def test_dependents_filter_lists_transitive_followers():
    assert listing(filters=[dep(DEPENDENTS, 2)]) == [4, 3]


def test_connected_filter_lists_dependencies_and_dependents_without_the_selected_issue():
    assert listing(filters=[dep(CONNECTED, 3)]) == [4, 2, 1]


def test_relates_to_filter_lists_the_whole_chain_of_relates_to_links():
    relates = {1: [2], 2: [3], 5: [4]}  # две независимые цепочки: 1-2-3 и 5-4
    assert listing(depends_on={}, relates=relates, filters=[dep(RELATES_TO, 2)]) == [3, 1]


def test_connected_filter_adds_relates_to_links_to_both_kinds_of_dependencies():
    relates = {3: [5]}
    assert listing(relates=relates, filters=[dep(CONNECTED, 3)]) == [5, 4, 2, 1]


def test_issue_reachable_by_dependency_and_relates_to_is_listed_once():
    relates = {3: [2, 1]}  # 2 и 1 уже достижимы как зависимости 3
    assert listing(relates=relates, filters=[dep(CONNECTED, 3)]) == [4, 2, 1]


def test_relates_to_filter_never_lists_the_selected_issue_even_with_a_cycle():
    relates = {1: [2], 2: [3], 3: [1]}
    assert listing(depends_on={}, relates=relates, filters=[dep(RELATES_TO, 1)]) == [3, 2]


def test_relates_to_filter_is_intersected_with_a_dependency_filter():
    relates = {4: [1, 5]}
    # relates to 4: {1, 5}; зависимости 4 по цепочке: {3, 2, 1} -> пересечение {1}
    assert listing(relates=relates, filters=[dep(RELATES_TO, 4), dep(DEPENDENCIES, 4)]) == [1]


def test_several_filters_are_intersected():
    # 4 зависит от {3,2,1}; от 1 зависят {2,3,4} -> пересечение {3,2}
    assert listing(filters=[dep(DEPENDENCIES, 4), dep(DEPENDENTS, 1)]) == [3, 2]


def test_same_filter_twice_changes_nothing():
    assert listing(filters=[dep(DEPENDENCIES, 4), dep(DEPENDENCIES, 4)]) == [3, 2, 1]


def test_disjoint_filters_give_empty_result_not_an_error():
    depends_on = {2: [1], 4: [3]}
    assert listing(depends_on=depends_on, filters=[dep(DEPENDENCIES, 2), dep(DEPENDENCIES, 4)]) == []


def test_no_links_gives_empty_result():
    assert listing(depends_on={}, filters=[dep(CONNECTED, 3)]) == []


def test_at_least_one_filter_is_required():
    with pytest.raises(ValueError):
        listing(filters=[])


# -- совместная работа с остальными фильтрами ---------------------------------

def test_state_filter_hides_issues_but_traversal_still_goes_through_them():
    issues = [make_issue(1), make_issue(2), make_issue(3, state="closed"), make_issue(4)]
    assert listing(issues=issues, filters=[dep(DEPENDENCIES, 4)], state="open") == [2, 1]
    assert listing(issues=issues, filters=[dep(DEPENDENCIES, 4)], state="closed") == [3]


def test_labels_filter_requires_every_selected_label_case_insensitively():
    issues = [
        make_issue(1, labels=["bug", "ui"]),
        make_issue(2, labels=["bug"]),
        make_issue(3, labels=["UI", "Bug"]),
        make_issue(4),
    ]
    result = listing(issues=issues, filters=[dep(DEPENDENCIES, 4)], labels=["bug", "ui"])
    assert result == [3, 1]


def test_search_matches_title_words_case_insensitively():
    issues = [
        make_issue(1, title="Fix Login page"),
        make_issue(2, title="login timeout"),
        make_issue(3, title="Fix signup"),
        make_issue(4),
    ]
    assert listing(issues=issues, filters=[dep(DEPENDENCIES, 4)], search="LOGIN") == [2, 1]
    assert listing(issues=issues, filters=[dep(DEPENDENCIES, 4)], search="fix login") == [1]


@pytest.mark.parametrize(
    "sort,direction,expected",
    [
        ("created", "desc", [3, 2, 1]),
        ("created", "asc", [1, 2, 3]),
        ("comments", "desc", [1, 3, 2]),
        ("comments", "asc", [2, 3, 1]),
        ("updated", "asc", [1, 2, 3]),
    ],
)
def test_sorting_is_applied_to_the_closure(sort, direction, expected):
    issues = [make_issue(1, comments=9), make_issue(2, comments=0), make_issue(3, comments=4), make_issue(4)]
    result = listing(issues=issues, filters=[dep(DEPENDENCIES, 4)], sort=sort, direction=direction)
    assert result == expected


def test_equal_sort_keys_keep_a_deterministic_order():
    issues = [make_issue(n, comments=1) for n in range(1, 5)]
    assert listing(issues=issues, filters=[dep(DEPENDENCIES, 4)], sort="comments", direction="desc") == [3, 2, 1]


def test_pagination_slices_the_filtered_sorted_set():
    depends_on = {26: list(range(1, 26))}
    issues = [make_issue(n, day=(n % 28) + 1) for n in range(1, 27)]
    page = lambda p: listing(depends_on=depends_on, issues=issues, filters=[dep(DEPENDENCIES, 26)], page=p)
    assert [len(page(1)), len(page(2)), len(page(3)), len(page(4))] == [10, 10, 5, 0]
    assert sorted(page(1) + page(2) + page(3)) == list(range(1, 26))


@pytest.mark.parametrize("query", [{"state": "bogus"}, {"sort": "bogus"}, {"direction": "bogus"}])
def test_unsupported_query_values_are_rejected(query):
    with pytest.raises(ValueError):
        listing(filters=[dep(DEPENDENCIES, 4)], **query)


# -- ошибки (раздел 5) ---------------------------------------------------

def test_cycle_aborts_listing_with_a_domain_error_naming_the_cycle():
    with pytest.raises(DependencyCycleError, match="цикл.*2 -> 1 -> 2|цикл.*1 -> 2 -> 1"):
        listing(depends_on={2: [1], 1: [2]}, filters=[dep(DEPENDENCIES, 2)])


def test_fetch_errors_propagate_unchanged():
    class Broken:
        def list_issue_dependencies(self, *args):
            raise RuntimeError("rate limit")

    lister = DependencyIssueLister(Broken())
    with pytest.raises(RuntimeError, match="rate limit"):
        lister.list("octo", "hello", [dep(DEPENDENCIES, 1)], state="all", labels=None,
                    sort="created", direction="desc", search=None, page=1, per_page=10)


# -- кэш -------------------------------------------------------------------

def test_next_page_does_not_hit_github_again_until_invalidated():
    github = FakeGitHub([make_issue(n) for n in range(1, 6)], CHAIN)
    lister = DependencyIssueLister(github)
    query = dict(state="all", labels=None, sort="created", direction="desc", search=None, per_page=2)

    lister.list("octo", "hello", [dep(DEPENDENCIES, 4)], page=1, **query)
    calls_after_first_page = len(github.calls)
    lister.list("octo", "hello", [dep(DEPENDENCIES, 4)], page=2, **query)
    assert len(github.calls) == calls_after_first_page

    lister.invalidate()
    lister.list("octo", "hello", [dep(DEPENDENCIES, 4)], page=1, **query)
    assert len(github.calls) == 2 * calls_after_first_page
