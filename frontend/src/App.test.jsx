import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "./App";
import { DialogOpenProvider } from "./dialogGate";

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    api: {
      getAppState: vi.fn().mockResolvedValue({
        account: { login: "octocat", avatar_url: "" },
        current_repo: "octocat/hello-world",
        has_token: true,
        operation_in_progress: false,
      }),
      getUploadQueue: vi.fn().mockResolvedValue([
        { id: "a", title: "A", original_filename: "a.md", body: "body a", labels: [], error: null },
        { id: "b", title: "B", original_filename: "b.md", body: "body b", labels: [], error: null },
      ]),
      listRepositoryLabels: vi.fn().mockResolvedValue([]),
      listIssues: vi.fn().mockResolvedValue({ issues: [] }),
      openSettings: vi.fn().mockResolvedValue({ masked_token: null, download_default_folder: null }),
      updateUploadItem: vi.fn().mockResolvedValue(null),
      removeUploadItems: vi.fn().mockResolvedValue([]),
    },
  };
});

function renderApp() {
  return render(
    <DialogOpenProvider>
      <App />
    </DialogOpenProvider>
  );
}

describe("App: tab focus shortcuts (Ctrl+[ / Ctrl+])", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Ctrl+] focuses the Download tab and Ctrl+[ focuses the Upload tab", async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText("Upload").className).toMatch(/active/));

    fireEvent.keyDown(window, { code: "BracketRight", ctrlKey: true });
    expect(screen.getByText("Download").className).toMatch(/active/);
    expect(screen.getByText("Upload").className).not.toMatch(/active/);

    fireEvent.keyDown(window, { code: "BracketLeft", ctrlKey: true });
    expect(screen.getByText("Upload").className).toMatch(/active/);
  });

  it("preserves Upload tab selection when switching to Download and back", async () => {
    renderApp();
    const checkboxes = await screen.findAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0]).toBeChecked();

    fireEvent.keyDown(window, { code: "BracketRight", ctrlKey: true }); // -> Download
    fireEvent.keyDown(window, { code: "BracketLeft", ctrlKey: true }); // -> Upload

    const checkboxesAfter = screen.getAllByRole("checkbox");
    expect(checkboxesAfter[0]).toBeChecked();
  });

  it("fires even while focus is inside a text input", async () => {
    renderApp();
    await screen.findAllByRole("checkbox");
    const searchInput = screen.getByPlaceholderText("Поиск по очереди...");
    searchInput.focus();

    fireEvent.keyDown(searchInput, { code: "BracketRight", ctrlKey: true, bubbles: true });
    expect(screen.getByText("Download").className).toMatch(/active/);
  });
});
