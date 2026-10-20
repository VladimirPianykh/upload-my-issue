import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DownloadScreen from "./DownloadScreen";
import { DialogProvider } from "../dialogs/DialogProvider";
import { DialogOpenProvider } from "../dialogGate";
import { api } from "../api";

vi.mock("../api", () => ({
  api: {
    listIssues: vi.fn(),
    listRepositoryLabels: vi.fn(),
    openSettings: vi.fn(),
    searchIssuesForDependencyFilter: vi.fn(),
  },
  onBackendEvent: () => () => {},
}));

const LIST = [
  { number: 1, title: "Issue 1", state: "open", labels: [], body: "b1" },
  { number: 2, title: "Issue 2", state: "open", labels: [], body: "b2" },
];
const CARDS = [
  { number: 7, title: "Login bug", state: "open", dependencies_count: 2, dependents_count: 3 },
  { number: 9, title: "Login timeout", state: "closed", dependencies_count: 0, dependents_count: 1 },
];

function renderScreen() {
  return render(
    <DialogOpenProvider>
      <DialogProvider>
        <DownloadScreen
          isActive
          currentRepo="octo/hello"
          onOperationStateChange={() => {}}
          issuesMayBeStale={false}
          onIssuesRefreshed={() => {}}
        />
      </DialogProvider>
    </DialogOpenProvider>
  );
}

const searchBox = () => screen.getByPlaceholderText(/Поиск по title/);
const popup = () => screen.queryByRole("listbox", { name: "Автодополнение" });
const lastListCall = () => api.listIssues.mock.calls.at(-1)[0];

// Изменение поиска перезагружает список и сбрасывает выделение (существующее
// поведение), поэтому выделять issues нужно после того, как эта перезагрузка прошла.
async function settledAfterSearch(text) {
  await waitFor(() => expect(lastListCall().search).toBe(text));
  await screen.findAllByRole("checkbox");
}

async function openIssueList(user, text = "!dep#log") {
  renderScreen();
  await user.type(searchBox(), text);
  await screen.findByRole("option", { name: /Login bug/ });
}

beforeEach(() => {
  vi.clearAllMocks();
  api.listIssues.mockResolvedValue({ issues: LIST });
  api.listRepositoryLabels.mockResolvedValue([]);
  api.openSettings.mockResolvedValue({ masked_token: null, download_default_folder: null });
  api.searchIssuesForDependencyFilter.mockResolvedValue(CARDS);
});

describe("construct autocomplete", () => {
  it("typing '!' offers all three constructs", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.type(searchBox(), "!");
    const options = within(popup()).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual([
      expect.stringContaining("!dep#"),
      expect.stringContaining("!idep#"),
      expect.stringContaining("!rel#"),
    ]);
  });

  it("choosing a construct inserts it and opens the issue list", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.type(searchBox(), "!i");
    await user.click(within(popup()).getByRole("option", { name: /!idep#/ }));
    expect(searchBox()).toHaveValue("!idep#");
    await waitFor(() => expect(api.searchIssuesForDependencyFilter).toHaveBeenCalledWith(""));
    expect(await screen.findByRole("option", { name: /Login bug/ })).toBeInTheDocument();
  });

  it("no autocomplete for ordinary text", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.type(searchBox(), "login");
    expect(popup()).toBeNull();
  });
});

describe("issue cards", () => {
  it("search by the word after '#' and show title, status and both counters", async () => {
    const user = userEvent.setup();
    await openIssueList(user);
    expect(api.searchIssuesForDependencyFilter).toHaveBeenLastCalledWith("log");
    const card = within(popup()).getByRole("option", { name: /Login bug/ });
    expect(card).toHaveTextContent("open");
    expect(card).toHaveTextContent("Зависимости: 2");
    expect(card).toHaveTextContent("Зависимые: 3");
    expect(within(popup()).getByRole("option", { name: /Login timeout/ })).toHaveTextContent("closed");
  });

  it("shows a message and stays open when nothing is found", async () => {
    api.searchIssuesForDependencyFilter.mockResolvedValue([]);
    const user = userEvent.setup();
    renderScreen();
    await user.type(searchBox(), "!dep#zzz");
    expect(await within(popup()).findByText("Issues не найдены")).toBeInTheDocument();
    expect(popup()).toBeInTheDocument();
  });

  it("arrow keys move between cards and Enter selects the current one", async () => {
    const user = userEvent.setup();
    await openIssueList(user);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(within(screen.getByRole("list", { name: "Фильтры зависимостей" })).getByText(/#9/)).toBeInTheDocument();
  });

  it("ArrowUp returns to the previous card and Tab selects like Enter", async () => {
    const user = userEvent.setup();
    await openIssueList(user);
    await user.keyboard("{ArrowDown}{ArrowUp}{Tab}");
    expect(within(screen.getByRole("list", { name: "Фильтры зависимостей" })).getByText(/#7/)).toBeInTheDocument();
  });
});

describe("selecting an issue", () => {
  it("creates a filter chip, removes the construct text and reloads with the filter", async () => {
    const user = userEvent.setup();
    await openIssueList(user, "fix !dep#log");
    await user.click(within(popup()).getByRole("option", { name: /Login bug/ }));

    const chips = screen.getByRole("list", { name: "Фильтры зависимостей" });
    expect(within(chips).getByText(/Зависимости/)).toBeInTheDocument();
    expect(within(chips).getByText(/#7/)).toBeInTheDocument();
    expect(searchBox()).toHaveValue("fix ");
    expect(popup()).toBeNull();
    await waitFor(() =>
      expect(lastListCall().dependencyFilters).toEqual([{ mode: "dependencies", number: 7 }])
    );
  });

  it("each construct maps to its own mode", async () => {
    const user = userEvent.setup();
    renderScreen();
    for (const [text, mode] of [["!idep#log", "dependents"], ["!rel#log", "related"]]) {
      await user.clear(searchBox());
      await user.type(searchBox(), text);
      await user.click(await within(popup()).findByRole("option", { name: /Login bug/ }));
      await waitFor(() => expect(lastListCall().dependencyFilters).toContainEqual({ mode, number: 7 }));
    }
  });

  it("several filters can be active at once and are all sent", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.type(searchBox(), "!dep#a");
    await user.click(await within(popup()).findByRole("option", { name: /Login bug/ }));
    await user.type(searchBox(), "!rel#b");
    await user.click(await within(popup()).findByRole("option", { name: /Login timeout/ }));
    await waitFor(() =>
      expect(lastListCall().dependencyFilters).toEqual([
        { mode: "dependencies", number: 7 },
        { mode: "related", number: 9 },
      ])
    );
  });

  it("removing a filter with the cross reloads without it and does not restore the text", async () => {
    const user = userEvent.setup();
    await openIssueList(user);
    await user.click(within(popup()).getByRole("option", { name: /Login bug/ }));
    await user.click(screen.getByRole("button", { name: /Удалить фильтр/ }));

    expect(screen.queryByRole("list", { name: "Фильтры зависимостей" })).toBeNull();
    expect(searchBox()).toHaveValue("");
    await waitFor(() => expect(lastListCall().dependencyFilters).toBeNull());
  });

  it("the chip is read-only: its only control is the remove button", async () => {
    const user = userEvent.setup();
    await openIssueList(user);
    await user.click(within(popup()).getByRole("option", { name: /Login bug/ }));
    const chips = screen.getByRole("list", { name: "Фильтры зависимостей" });
    expect(within(chips).getAllByRole("button")).toHaveLength(1);
    expect(within(chips).queryByRole("textbox")).toBeNull();
  });
});

describe("closing the list", () => {
  it("Escape closes without creating a filter and without clearing the issue selection", async () => {
    const user = userEvent.setup();
    await openIssueList(user);
    await settledAfterSearch("!dep#log");
    fireEvent.click(screen.getAllByRole("checkbox")[0]); // клик не уводит фокус из поля поиска
    expect(screen.getAllByRole("checkbox")[0]).toBeChecked();

    await user.keyboard("{Escape}");

    expect(popup()).toBeNull();
    expect(screen.queryByRole("list", { name: "Фильтры зависимостей" })).toBeNull();
    expect(screen.getAllByRole("checkbox")[0]).toBeChecked();
    expect(searchBox()).toHaveValue("!dep#log");
  });

  it("Escape without an open list still clears the selection (existing shortcut)", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.type(searchBox(), "plain");
    await settledAfterSearch("plain");
    fireEvent.click((await screen.findAllByRole("checkbox"))[0]);
    expect(screen.getAllByRole("checkbox")[0]).toBeChecked();

    await user.keyboard("{Escape}");

    expect(screen.getAllByRole("checkbox")[0]).not.toBeChecked();
  });

  it("clicking outside closes the list", async () => {
    const user = userEvent.setup();
    await openIssueList(user);
    await user.click(document.body);
    expect(popup()).toBeNull();
  });

  it("losing focus closes the list and regaining it reopens by caret position", async () => {
    const user = userEvent.setup();
    await openIssueList(user);
    fireEvent.blur(searchBox());
    expect(popup()).toBeNull();
    fireEvent.focus(searchBox());
    expect(popup()).not.toBeNull();
  });

  it("continued typing reopens a closed list", async () => {
    const user = userEvent.setup();
    await openIssueList(user);
    await user.keyboard("{Escape}");
    expect(popup()).toBeNull();
    await user.keyboard("i");
    expect(await screen.findByRole("option", { name: /Login bug/ })).toBeInTheDocument();
  });

  it("moving the caret out of the construct word closes the list, moving back reopens it", async () => {
    const user = userEvent.setup();
    await openIssueList(user, "!dep#log");
    await user.keyboard("{Home}");
    expect(popup()).toBeNull();
    await user.keyboard("{End}");
    expect(popup()).not.toBeNull();
  });

  it("pasting a construct behaves like typing it", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(searchBox());
    await user.paste("!rel#log");
    expect(await screen.findByRole("option", { name: /Login bug/ })).toBeInTheDocument();
  });
});

describe("errors", () => {
  it("a failing list computation is shown through the regular list error and the app keeps working", async () => {
    api.listIssues.mockRejectedValue(new Error("Обнаружен цикл зависимостей: 1 -> 2 -> 1"));
    const user = userEvent.setup();
    renderScreen();
    expect(await screen.findByText(/Обнаружен цикл зависимостей/)).toBeInTheDocument();
    await user.type(searchBox(), "x");
    expect(searchBox()).toHaveValue("x");
  });
});

describe("edge cases", () => {
  it("selecting the same issue in the same mode twice does not duplicate the filter", async () => {
    const user = userEvent.setup();
    renderScreen();
    for (let i = 0; i < 2; i++) {
      await user.type(searchBox(), "!dep#a");
      await user.click(await within(popup()).findByRole("option", { name: /Login bug/ }));
    }
    const chips = screen.getByRole("list", { name: "Фильтры зависимостей" });
    expect(within(chips).getAllByRole("listitem")).toHaveLength(1);
    expect(searchBox()).toHaveValue("");
  });

  it("filters are dropped when the repository changes", async () => {
    const user = userEvent.setup();
    const ui = (repo) => (
      <DialogOpenProvider>
        <DialogProvider>
          <DownloadScreen
            isActive
            currentRepo={repo}
            onOperationStateChange={() => {}}
            issuesMayBeStale={false}
            onIssuesRefreshed={() => {}}
          />
        </DialogProvider>
      </DialogOpenProvider>
    );
    const { rerender } = render(ui("octo/hello"));
    await user.type(searchBox(), "!dep#a");
    await user.click(await within(popup()).findByRole("option", { name: /Login bug/ }));
    expect(screen.getByRole("list", { name: "Фильтры зависимостей" })).toBeInTheDocument();

    rerender(ui("octo/other"));
    await waitFor(() => expect(screen.queryByRole("list", { name: "Фильтры зависимостей" })).toBeNull());
  });

  it("a failing autocomplete request is shown in the list and does not break the input", async () => {
    api.searchIssuesForDependencyFilter.mockRejectedValue(new Error("rate limit exceeded"));
    const user = userEvent.setup();
    renderScreen();
    await user.type(searchBox(), "!dep#a");
    expect(await within(popup()).findByText("rate limit exceeded")).toBeInTheDocument();
    await user.type(searchBox(), "b");
    expect(searchBox()).toHaveValue("!dep#ab");
  });

  it("a slow response for an older query never overwrites the newer one", async () => {
    let releaseSlow;
    api.searchIssuesForDependencyFilter.mockImplementation((q) =>
      q === "a"
        ? new Promise((resolve) => { releaseSlow = () => resolve([{ ...CARDS[1], title: "STALE" }]); })
        : Promise.resolve(CARDS)
    );
    const user = userEvent.setup();
    renderScreen();
    await user.type(searchBox(), "!dep#a");
    await waitFor(() => expect(api.searchIssuesForDependencyFilter).toHaveBeenCalledWith("a"));
    await user.type(searchBox(), "b");
    await within(popup()).findByRole("option", { name: /Login bug/ });

    releaseSlow();
    await new Promise((r) => setTimeout(r, 20));
    expect(within(popup()).queryByText(/STALE/)).toBeNull();
    // актуальный список остаётся на месте, а не заменяется «Загрузка...»
    expect(within(popup()).getByRole("option", { name: /Login bug/ })).toBeInTheDocument();
  });
});
