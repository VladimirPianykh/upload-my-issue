# Markdown ⇄ GitHub Issues

Приложение для массового импорта Markdown-файлов в GitHub Issues и экспорта
Issues обратно в Markdown, в рамках одного репозитория. Реализовано согласно
`essential.md`.

## Стек

- **Backend**: Python + [pywebview](https://pywebview.flowrl.com/) (нативное
  окно + мост к GitHub API, файловой системе, Windows Credential Manager).
- **Frontend**: React (Vite), рендерится внутри окна pywebview.

## Запуск (Windows)

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

cd ..\frontend
npm install
npm run build

cd ..\backend
python main.py
```

Для разработки с горячей перезагрузкой фронтенда:

```powershell
# терминал 1
cd frontend && npm run dev

# терминал 2
cd backend
$env:WEBVIEW_DEV = "1"
python main.py
```

## Структура

```
backend/
  api.py            # мост Python <-> React (window.pywebview.api)
  main.py           # создание окна, биндинг drag&drop
  github_client.py  # GitHub REST API
  token_store.py    # токен через Windows Credential Manager (keyring)
  url_parser.py     # разбор GitHub URL с защитой от инъекций
  filename_utils.py # title (Upload) и имя файла (Download)
  upload_queue.py   # модель очереди, дедупликация, рекурсивный скан
  md_utils.py       # чтение .md: кодировки, BOM, лимит размера
  settings_store.py # локальные настройки (JSON)
  tests/            # pytest для всей "чистой" логики (32 теста)
frontend/
  src/
    api.js                     # обёртка над window.pywebview.api
    upload/addPipeline.js      # общий пайплайн добавления файлов (DnD/Ctrl+V/диалог)
    dialogs/DialogProvider.jsx # промис-модалки (Retry/Skip/Apply to all и т.п.)
    components/                # экраны и карточки
```

## Важные технические решения и допущения

Ниже - места, где спецификация допускала интерпретацию, либо где решение
опирается на недокументированное поведение сторонних библиотек. Стоит
перепроверить на реальной Windows-машине перед продакшен-использованием.

1. **Хранение токена**: через `keyring` (backend `WinVaultKeyring` на
   Windows) - использует Windows Credential Manager, который сам защищает
   данные через DPAPI. Отдельного вызова DPAPI API в коде нет - это
   реализация `keyring`, а не костыль.

2. **Drag&drop файлов**: pywebview не даёт полный путь к файлу через
   стандартный браузерный File API (ограничение безопасности WebView2).
   Используется официальный, задокументированный механизм pywebview
   `window.dom.document.events.drop` + `pywebviewFullPath`
   (https://pywebview.flowrl.com/examples/drag_drop.html). В разных версиях
   pywebview этот путь встречался под разными ключами (`dataTransfer` в
   примере, `domTransfer` в changelog 5.0.1) - код поддерживает оба на
   всякий случай.

3. **Ctrl+V (вставка файлов/папок из Проводника)**: официального
   API pywebview для paste с полными путями нет. По вашему выбору
   реализовано напрямую через `pywin32`: обработчик `keydown` во фронтенде
   ловит `Ctrl+V`, дальше `Api.paste_from_clipboard()` читает буфер обмена
   (`CF_HDROP` - список файлов/папок, скопированных в Проводнике; если его
   нет - `CF_UNICODETEXT`, построчно, оставляя только реально существующие
   пути). Результат прогоняется через тот же пайплайн, что и drag&drop, как
   и требует раздел 12. **Не проверено на реальной Windows-машине** - в
   среде разработки нет GUI/Windows для сквозного теста; логика чтения
   CF_HDROP через pywin32 стандартная, но стоит один раз вручную проверить
   реальный Ctrl+V из Проводника после сборки.

4. **"Apply to all" при ошибках чтения/недоступных папках** (раздел 6):
   решение (Retry/Skip) запоминается на время текущего добавления и
   применяется ко всем последующим проблемам того же типа. Если пользователь
   выбрал "Apply to all" + Retry, а повторная попытка снова падает - файл
   молча пропускается (иначе возможен бесконечный цикл повторов). Это не
   описано в спецификации явно - при необходимости легко изменить.

5. **GitHub Search API для поиска по title** (раздел 4): сортировка
   результатов поиска Search API не совпадает 1:1 с сортировкой обычного
   issues-listing, поэтому при активном поиске по title применяется только
   фильтрация по состоянию (`state`), без сортировки по `created`/`updated`/
   `comments` - иначе пришлось бы обещать сортировку, которой Search API не
   даёт в требуемом виде.

6. **Заполнитель недопустимых символов имени файла** (раздел 5): выбран `_`
   (подчёркивание) - спецификация оставляет выбор символа на усмотрение
   реализации.

7. Тестами покрыта вся детерминированная логика без сети/GUI (парсинг URL,
   правила title/filename, дедупликация, чтение Markdown) - 32/32 pytest.
   Код, зависящий от pywebview/WebView2/Windows Credential Manager, по
   объективным причинам не может быть протестирован в среде без Windows GUI
   и должен быть проверен вручную после сборки.

8. **"Панели" в `spec/features/Additional shortcuts.md`** - в спецификации
   изначально шла речь о "двух панелях" с независимым выделением и фокусом.
   В текущем интерфейсе нет двух одновременно видимых панелей - есть две
   вкладки, Upload и Download (раздел 1 essential.md), между которыми
   переключаются кнопками сверху. По уточнению от заказчика "панели" - это
   и есть эти вкладки (Upload = левая, Download = правая); формулировки в
   `spec/features/Additional shortcuts.md` приведены в соответствие с этим
   (панель -> вкладка).

9. **Одновременно смонтированные Upload и Download** (Additional
   shortcuts.md: выделение на вкладке должно сохраняться при переключении
   на другую и обратно): `App.jsx` больше не размонтирует неактивный экран
   при переключении вкладки - оба компонента остаются в дереве постоянно,
   неактивный скрывается через стандартный HTML-атрибут `hidden`. Так как
   выделение (`selected`) живёт в состоянии самого экрана, оно переживает
   переключение без дополнительного стейта на уровне `App`. Побочный эффект,
   который пришлось учесть: раз `UploadScreen` теперь смонтирован и во время
   Download, его собственные shortcuts (`Ctrl+V`, `Delete`) тоже проверяют
   `isActive`, иначе они срабатывали бы независимо от того, какая вкладка
   открыта.

10. **Блокировка shortcuts при открытом диалоге** (Additional shortcuts.md:
    "Сочетания не обрабатываются при открытом внутреннем диалоге
    приложения"): добавлен `frontend/src/dialogGate.jsx` -
    `DialogOpenProvider`/`useAnyDialogOpen`/`useRegisterDialogOpen`, общий
    счётчик открытых диалогов (их несколько независимых видов:
    промис-диалоги `DialogProvider`, `RepoDialog`, `SettingsDialog`).
    `useShortcut` в `shortcuts.js` сам проверяет этот счётчик, поэтому
    правило действует сразу для всех shortcuts приложения, а не только для
    новых из Additional shortcuts.md.

11. **`Ctrl+A` в Download-вкладке** выделяет issues только текущей
    (уже загруженной) страницы - раздел 4 essential.md прямо запрещает
    локальную загрузку/сортировку всего набора issues, поэтому "весь список
    активной вкладки" здесь может означать только то, что реально загружено
    через постраничный GitHub API.

## Тесты

Backend (детерминированная логика, 32 теста):

```bash
cd backend
pip install -r requirements.txt
pytest tests/ -v
```

Frontend (React-компоненты и shortcuts, vitest + Testing Library):

```bash
cd frontend
npm install
npm test
```
