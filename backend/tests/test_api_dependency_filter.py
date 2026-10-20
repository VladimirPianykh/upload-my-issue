import pytest

from dependency_graph import BLOCKED_BY, BLOCKING, DEPENDENCIES, DEPENDENTS, RELATED
from error_log import GENERIC_MESSAGE
from github_client import Issue, Label


def make_issue(number, *, state="open", title=None, deps=0, dependents=0, pr=False):
    return Issue(
        number=number,
        title=title or f"Issue {number}",
        body="",
        state=state,
        labels=[Label(name="bug", color="d73a4a")],
        html_url=f"https://github.com/octo/hello/issues/{number}",
        is_pull_request=pr,
        created_at=f"2026-01-{number:02d}T00:00:00Z",
        updated_at=f"2026-01-{number:02d}T00:00:00Z",
        dependencies_count=deps,
        dependents_count=dependents,
    )


class FakeGitHub:
    """Фейк GitHubClient: единственная замоканная граница - сеть GitHub."""

    def __init__(self, issues, depends_on):
        self.issues = {i.number: i for i in issues}
        self.depends_on = depends_on
        self.dependency_calls = 0
        self.listed = []
        self.searched = []

    def list_issue_dependencies(self, owner, repo, number, direction):
        self.dependency_calls += 1
        if direction == BLOCKED_BY:
            numbers = self.depends_on.get(number, [])
        else:
            assert direction == BLOCKING
            numbers = [n for n, deps in self.depends_on.items() if number in deps]
        return [self.issues[n] for n in numbers]

    def list_issues(self, owner, repo, **kwargs):
        self.listed.append(kwargs)
        return list(self.issues.values())[: kwargs["per_page"]]

    def search_issues_by_title(self, owner, repo, query, **kwargs):
        self.searched.append((query, kwargs))
        return [i for i in self.issues.values() if query.lower() in i.title.lower()]


@pytest.fixture
def make_api(isolated_appdata):
    def factory(issues, depends_on):
        from api import Api

        api = Api()
        api._client = FakeGitHub(issues, depends_on)
        api._current_repo = "octo/hello"
        return api

    return factory


CHAIN = {4: [3], 3: [2], 2: [1]}
ISSUES = [make_issue(n, deps=1, dependents=2) for n in range(1, 6)]


def numbers(result):
    return [i["number"] for i in result["issues"]]


# -- list_issues с фильтрами зависимостей --------------------------------------

def test_list_issues_applies_dependency_filters(make_api):
    api = make_api(ISSUES, CHAIN)
    result = api.list_issues(dependency_filters=[{"mode": DEPENDENCIES, "number": 4}], state="all")
    assert numbers(result) == [3, 2, 1]


def test_list_issues_combines_dependency_filters_with_other_filters_and_paging(make_api):
    issues = [make_issue(1), make_issue(2, state="closed"), make_issue(3), make_issue(4)]
    api = make_api(issues, CHAIN)
    filters = [{"mode": DEPENDENCIES, "number": 4}]
    assert numbers(api.list_issues(dependency_filters=filters, state="open")) == [3, 1]
    assert numbers(api.list_issues(dependency_filters=filters, state="open", page=2)) == []


def test_list_issues_intersects_several_dependency_filters(make_api):
    api = make_api(ISSUES, CHAIN)
    filters = [{"mode": DEPENDENCIES, "number": 4}, {"mode": DEPENDENTS, "number": 1}]
    assert numbers(api.list_issues(dependency_filters=filters, state="all")) == [3, 2]


def test_result_carries_dependency_counts_for_cards(make_api):
    api = make_api(ISSUES, CHAIN)
    issue = api.list_issues(dependency_filters=[{"mode": RELATED, "number": 3}], state="all")["issues"][0]
    assert (issue["dependencies_count"], issue["dependents_count"]) == (1, 2)


def test_without_dependency_filters_the_server_side_listing_is_used(make_api):
    api = make_api(ISSUES, CHAIN)
    api.list_issues(state="closed", labels=["bug"], sort="comments", direction="asc")
    assert api._client.listed == [
        dict(state="closed", labels=["bug"], sort="comments", direction="asc", page=1, per_page=10)
    ]
    assert api._client.dependency_calls == 0


def test_empty_dependency_filter_list_means_no_dependency_filtering(make_api):
    api = make_api(ISSUES, CHAIN)
    api.list_issues(dependency_filters=[])
    assert len(api._client.listed) == 1


def test_no_results_is_an_empty_list_not_an_error(make_api):
    api = make_api(ISSUES, {})
    assert api.list_issues(dependency_filters=[{"mode": RELATED, "number": 3}], state="all") == {"issues": []}


# -- ошибки (раздел 5) ---------------------------------------------------

def test_cycle_is_reported_with_its_own_message(make_api):
    api = make_api(ISSUES, {2: [1], 1: [2]})
    with pytest.raises(RuntimeError, match="цикл зависимостей"):
        api.list_issues(dependency_filters=[{"mode": DEPENDENCIES, "number": 2}])


def test_unexpected_exception_during_listing_becomes_the_generic_error(make_api):
    api = make_api(ISSUES, CHAIN)
    api._client.list_issue_dependencies = lambda *a: (_ for _ in ()).throw(KeyError("boom"))
    with pytest.raises(RuntimeError, match=GENERIC_MESSAGE):
        api.list_issues(dependency_filters=[{"mode": DEPENDENCIES, "number": 4}])


def test_unknown_filter_mode_is_a_validation_error(make_api):
    api = make_api(ISSUES, CHAIN)
    with pytest.raises(ValueError):
        api.list_issues(dependency_filters=[{"mode": "bogus", "number": 4}])


# -- кэш ---------------------------------------------------------------------

def test_refresh_clears_the_dependency_cache(make_api):
    api = make_api(ISSUES, CHAIN)
    filters = [{"mode": DEPENDENCIES, "number": 4}]
    api.list_issues(dependency_filters=filters, state="all")
    first = api._client.dependency_calls
    api.list_issues(dependency_filters=filters, state="all", page=1, sort="comments")
    assert api._client.dependency_calls == first  # из кэша

    api.refresh_issues_cache()
    api.list_issues(dependency_filters=filters, state="all")
    assert api._client.dependency_calls == 2 * first


# -- автодополнение -------------------------------------------------------

def test_autocomplete_searches_titles_in_all_states(make_api):
    issues = [make_issue(1, title="Login bug", deps=2, dependents=3), make_issue(2, title="Other")]
    api = make_api(issues, {})
    cards = api.search_issues_for_dependency_filter("login")
    assert api._client.searched[0][1]["state"] == "all"
    assert cards == [
        {"number": 1, "title": "Login bug", "state": "open", "dependencies_count": 2, "dependents_count": 3}
    ]


def test_autocomplete_without_text_lists_issues_of_all_states(make_api):
    api = make_api(ISSUES, {})
    cards = api.search_issues_for_dependency_filter("")
    assert api._client.listed[0]["state"] == "all"
    assert len(cards) == 5


def test_autocomplete_hides_pull_requests(make_api):
    api = make_api([make_issue(1, title="x"), make_issue(2, title="x", pr=True)], {})
    assert [c["number"] for c in api.search_issues_for_dependency_filter("x")] == [1]
