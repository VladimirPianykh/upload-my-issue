"""
Парсинг GitHub URL/ссылок репозитория.

Требования из спецификации (essential.md, раздел 3):
- терпимость к завершающему '/', '.git', '/issues', ссылкам на конкретный issue;
- запрет неконтролируемой интерпретации '.', '/' и т.п. как частей локальных
  путей или имён файлов -> вся валидация идёт через один анкорный regex,
  никакого os.path.join / naive split по '/' с последующим использованием
  результата как пути.

Результат парсинга - только (owner, repo) в виде проверенных идентификаторов.
Дальше они используются исключительно как компоненты GitHub API URL
(https://api.github.com/repos/{owner}/{repo}/...), никогда как часть
локального пути.
"""
from __future__ import annotations

import re
from dataclasses import dataclass


class InvalidRepoUrlError(ValueError):
    """Некорректная или неподдерживаемая ссылка на репозиторий."""


# Правила именования GitHub:
# - owner (user/org login): буквы/цифры/дефисы, не начинается и не
#   заканчивается дефисом, без двух дефисов подряд, до 39 символов.
# - repo name: буквы/цифры/'.', '-', '_' , длина 1..100, не '.' и не '..'.
_OWNER_RE = r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?"
_REPO_RE = r"[A-Za-z0-9._-]{1,100}"

# Полный анкорный шаблон: opt(scheme)://opt(www.)github.com/OWNER/REPO(.git)?(/...)?
_HTTP_PATTERN = re.compile(
    rf"^(?:https?://)?(?:www\.)?github\.com/"
    rf"(?P<owner>{_OWNER_RE})/"
    rf"(?P<repo>{_REPO_RE}?)"
    rf"(?:\.git)?"
    rf"(?:/(?:issues(?:/\d+)?)?)?"
    rf"/?$",
    re.IGNORECASE,
)

_SSH_PATTERN = re.compile(
    rf"^git@github\.com:(?P<owner>{_OWNER_RE})/(?P<repo>{_REPO_RE}?)(?:\.git)?/?$",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class RepoRef:
    owner: str
    repo: str

    @property
    def full_name(self) -> str:
        return f"{self.owner}/{self.repo}"


def _reject_dangerous(raw: str) -> None:
    # Нулевые байты, управляющие символы, обратные слеши и '..' как
    # отдельный сегмент - явные признаки попытки инъекции пути.
    if "\x00" in raw or any(ord(c) < 0x20 for c in raw):
        raise InvalidRepoUrlError("URL содержит недопустимые управляющие символы")
    if "\\" in raw:
        raise InvalidRepoUrlError("URL содержит недопустимые символы")


def parse_repo_url(raw: str) -> RepoRef:
    """Разбирает пользовательский ввод в проверенные owner/repo.

    Ничего, кроме двух подстрок, прошедших whitelisting-regex, наружу
    не возвращается - это и есть защита от инъекций.
    """
    if raw is None:
        raise InvalidRepoUrlError("Пустой URL")
    raw = raw.strip()
    if not raw:
        raise InvalidRepoUrlError("Пустой URL")

    _reject_dangerous(raw)

    m = _HTTP_PATTERN.match(raw) or _SSH_PATTERN.match(raw)
    if not m:
        raise InvalidRepoUrlError(
            "Не удалось распознать ссылку на репозиторий GitHub"
        )

    owner, repo = m.group("owner"), m.group("repo")
    if not owner or not repo:
        raise InvalidRepoUrlError("Ссылка не содержит owner/repo")
    if repo in (".", ".."):
        raise InvalidRepoUrlError("Недопустимое имя репозитория")

    return RepoRef(owner=owner, repo=repo)
