import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from dependency_graph import BLOCKED_BY, BLOCKING, RELATES
from github_client import GitHubClient


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload


def issue_json(number, repo="octo/hello", **extra):
    data = {
        "number": number,
        "title": f"Issue {number}",
        "body": f"body {number}",
        "state": "open",
        "labels": [],
        "html_url": f"https://github.com/{repo}/issues/{number}",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-02T00:00:00Z",
        "comments": 0,
    }
    data.update(extra)
    return data


@pytest.fixture
def github(monkeypatch):
    """GitHubClient, у которого сеть заменена очередью заготовленных ответов."""
    client = GitHubClient("token")
    client.requests = []
    client.responses = []

    def fake_request(method, url, **kwargs):
        client.requests.append((method, url, kwargs.get("params")))
        return FakeResponse(client.responses.pop(0))

    monkeypatch.setattr(client._session, "request", fake_request)
    return client


# -- list_issue_dependencies ----------------------------------------------

def test_blocked_by_hits_the_blocked_by_endpoint(github):
    github.responses = [[issue_json(2), issue_json(3)]]

    issues = github.list_issue_dependencies("octo", "hello", 7, BLOCKED_BY)

    method, url, params = github.requests[0]
    assert (method, url) == (
        "GET",
        "https://api.github.com/repos/octo/hello/issues/7/dependencies/blocked_by",
    )
    assert params["per_page"] == 100
    assert [i.number for i in issues] == [2, 3]


def test_blocking_hits_the_blocking_endpoint(github):
    github.responses = [[issue_json(9)]]

    issues = github.list_issue_dependencies("octo", "hello", 7, BLOCKING)

    assert github.requests[0][1].endswith("/issues/7/dependencies/blocking")
    assert [i.number for i in issues] == [9]


def test_relates_to_hits_its_own_endpoint_outside_of_dependencies(github):
    github.responses = [[issue_json(5), issue_json(6)]]

    issues = github.list_issue_dependencies("octo", "hello", 7, RELATES)

    method, url, _ = github.requests[0]
    assert (method, url) == ("GET", "https://api.github.com/repos/octo/hello/issues/7/relates_to")
    assert [i.number for i in issues] == [5, 6]


def test_issues_of_other_repositories_are_ignored_for_relates_to_too(github):
    github.responses = [[issue_json(5), issue_json(6, repo="someone/else")]]

    issues = github.list_issue_dependencies("octo", "hello", 7, RELATES)

    assert [i.number for i in issues] == [5]


def test_all_pages_are_read(github):
    github.responses = [[issue_json(n) for n in range(1, 101)], [issue_json(101)]]

    issues = github.list_issue_dependencies("octo", "hello", 500, BLOCKED_BY)

    assert len(issues) == 101
    assert [r[2]["page"] for r in github.requests] == [1, 2]


def test_an_issue_repeated_on_page_boundaries_is_returned_once(github):
    # список изменился между запросами страниц: issue 100 пришла дважды
    first_page = [issue_json(n) for n in range(1, 101)]
    github.responses = [first_page, [issue_json(100), issue_json(101)]]

    issues = github.list_issue_dependencies("octo", "hello", 500, BLOCKED_BY)

    assert [i.number for i in issues] == list(range(1, 102))


def test_issues_of_other_repositories_are_ignored(github):
    github.responses = [[
        issue_json(2),
        issue_json(3, repo="someone/else"),
        issue_json(4, repo="OCTO/Hello"),  # имена репозиториев регистронезависимы
    ]]

    issues = github.list_issue_dependencies("octo", "hello", 7, BLOCKED_BY)

    assert [i.number for i in issues] == [2, 4]


def test_unknown_direction_is_rejected(github):
    with pytest.raises(ValueError):
        github.list_issue_dependencies("octo", "hello", 7, "sideways")


# -- поля Issue, нужные карточкам и локальной сортировке -----------------------

def test_issue_exposes_dependency_counts_and_sort_fields(github):
    github.responses = [[issue_json(
        2,
        comments=5,
        issue_dependencies_summary={
            "blocked_by": 1, "total_blocked_by": 3, "blocking": 0, "total_blocking": 4,
        },
    )]]

    issue = github.list_issue_dependencies("octo", "hello", 7, BLOCKED_BY)[0]

    assert issue.dependencies_count == 3
    assert issue.dependents_count == 4
    assert issue.comments == 5
    assert issue.created_at == "2026-01-01T00:00:00Z"
    assert issue.updated_at == "2026-01-02T00:00:00Z"


def test_missing_dependency_summary_means_zero_counts(github):
    github.responses = [[issue_json(2)]]

    issue = github.list_issue_dependencies("octo", "hello", 7, BLOCKED_BY)[0]

    assert (issue.dependencies_count, issue.dependents_count) == (0, 0)
