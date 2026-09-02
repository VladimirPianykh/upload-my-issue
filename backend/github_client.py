"""
Тонкая обёртка над GitHub REST API v3, покрывающая ровно то, что нужно
спецификации:

- проверка токена и данные аккаунта (раздел 2);
- список репозиториев с affiliation owner/collaborator/organization_member
  (раздел 2, 3);
- список Issues репозитория с серверной фильтрацией/сортировкой и поиском по
  title через Search API (раздел 4);
- labels репозитория (раздел 8);
- создание Issue (раздел 9, 10).

Все параметры фильтрации/сортировки ограничены тем, что реально
поддерживает API - раздел 4 явно запрещает обещать в UI больше.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import requests

API_ROOT = "https://api.github.com"
_TIMEOUT = 30

SUPPORTED_SORT_FIELDS = ("created", "updated", "comments")
SUPPORTED_DIRECTIONS = ("asc", "desc")
SUPPORTED_STATES = ("open", "closed", "all")


class GitHubApiError(RuntimeError):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class GitHubAuthError(GitHubApiError):
    """Токен отсутствует/истёк/отозван/не хватает прав."""


@dataclass
class GitHubUser:
    login: str
    avatar_url: str


@dataclass
class RepoSummary:
    full_name: str
    owner: str
    name: str
    private: bool


@dataclass
class Label:
    name: str
    color: str


@dataclass
class Issue:
    number: int
    title: str
    body: str
    state: str
    labels: list[Label]
    html_url: str
    is_pull_request: bool


class GitHubClient:
    def __init__(self, token: str):
        self._session = requests.Session()
        self._session.headers.update(
            {
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            }
        )

    def _request(self, method: str, path: str, **kwargs) -> requests.Response:
        url = path if path.startswith("http") else f"{API_ROOT}{path}"
        try:
            resp = self._session.request(method, url, timeout=_TIMEOUT, **kwargs)
        except requests.RequestException as exc:
            raise GitHubApiError(f"Сетевая ошибка: {exc}") from exc

        if resp.status_code in (401, 403):
            message = _extract_message(resp) or "Токен недействителен, отозван или не хватает прав"
            raise GitHubAuthError(message, status_code=resp.status_code)
        if resp.status_code >= 400:
            message = _extract_message(resp) or f"Ошибка GitHub API ({resp.status_code})"
            raise GitHubApiError(message, status_code=resp.status_code)
        return resp

    # -- Раздел 2: авторизация -------------------------------------------------

    def get_authenticated_user(self) -> GitHubUser:
        resp = self._request("GET", "/user")
        data = resp.json()
        return GitHubUser(login=data["login"], avatar_url=data.get("avatar_url", ""))

    # -- Раздел 2/3: список репозиториев ----------------------------------------

    def list_repositories(self) -> list[RepoSummary]:
        """owner + collaborator + organization_member через affiliation."""
        repos: list[RepoSummary] = []
        page = 1
        while True:
            resp = self._request(
                "GET",
                "/user/repos",
                params={
                    "affiliation": "owner,collaborator,organization_member",
                    "per_page": 100,
                    "page": page,
                    "sort": "full_name",
                },
            )
            batch = resp.json()
            for r in batch:
                repos.append(
                    RepoSummary(
                        full_name=r["full_name"],
                        owner=r["owner"]["login"],
                        name=r["name"],
                        private=r["private"],
                    )
                )
            if len(batch) < 100:
                break
            page += 1
        return repos

    def get_repository(self, owner: str, repo: str) -> RepoSummary:
        resp = self._request("GET", f"/repos/{owner}/{repo}")
        data = resp.json()
        return RepoSummary(
            full_name=data["full_name"],
            owner=data["owner"]["login"],
            name=data["name"],
            private=data["private"],
        )

    # -- Раздел 8: labels ---------------------------------------------------

    def list_labels(self, owner: str, repo: str) -> list[Label]:
        labels: list[Label] = []
        page = 1
        while True:
            resp = self._request(
                "GET",
                f"/repos/{owner}/{repo}/labels",
                params={"per_page": 100, "page": page},
            )
            batch = resp.json()
            labels.extend(Label(name=l["name"], color=l["color"]) for l in batch)
            if len(batch) < 100:
                break
            page += 1
        return labels

    # -- Раздел 4: список Issues ----------------------------------------------

    def list_issues(
        self,
        owner: str,
        repo: str,
        *,
        state: str = "open",
        labels: list[str] | None = None,
        sort: str = "created",
        direction: str = "desc",
        page: int = 1,
        per_page: int = 10,
    ) -> list[Issue]:
        if state not in SUPPORTED_STATES:
            raise ValueError(f"Unsupported state: {state}")
        if sort not in SUPPORTED_SORT_FIELDS:
            raise ValueError(f"Unsupported sort: {sort}")
        if direction not in SUPPORTED_DIRECTIONS:
            raise ValueError(f"Unsupported direction: {direction}")

        params = {
            "state": state,
            "sort": sort,
            "direction": direction,
            "page": page,
            "per_page": min(per_page, 100),
        }
        if labels:
            params["labels"] = ",".join(labels)

        resp = self._request("GET", f"/repos/{owner}/{repo}/issues", params=params)
        return [_issue_from_json(item) for item in resp.json()]

    def search_issues_by_title(
        self,
        owner: str,
        repo: str,
        query: str,
        *,
        state: str = "open",
        page: int = 1,
        per_page: int = 10,
    ) -> list[Issue]:
        """Поиск по title в пределах Search API (раздел 4).

        Search API не поддерживает сортировку по comments/created/updated в
        точности как issues-listing; сортировка результатов поиска здесь не
        применяется - только фильтрация по совпадению в title и состоянию.
        """
        qualifiers = [f"repo:{owner}/{repo}", "in:title", query]
        if state in ("open", "closed"):
            qualifiers.append(f"state:{state}")
        q = " ".join(qualifiers)
        resp = self._request(
            "GET",
            "/search/issues",
            params={"q": q, "page": page, "per_page": min(per_page, 100)},
        )
        return [_issue_from_json(item) for item in resp.json().get("items", [])]

    # -- Раздел 9/10: создание Issue -------------------------------------------

    def create_issue(self, owner: str, repo: str, title: str, body: str, labels: list[str] | None = None) -> Issue:
        payload = {"title": title, "body": body}
        if labels:
            payload["labels"] = labels
        resp = self._request("POST", f"/repos/{owner}/{repo}/issues", json=payload)
        return _issue_from_json(resp.json())


def _issue_from_json(data: dict) -> Issue:
    return Issue(
        number=data["number"],
        title=data["title"],
        body=data.get("body") or "",
        state=data["state"],
        labels=[Label(name=l["name"], color=l["color"]) for l in data.get("labels", [])],
        html_url=data["html_url"],
        # Раздел 4: Issues API может возвращать pull requests - отличаем по
        # наличию ключа 'pull_request'.
        is_pull_request="pull_request" in data,
    )


def _extract_message(resp: requests.Response) -> str | None:
    try:
        data = resp.json()
    except ValueError:
        return None
    return data.get("message")
