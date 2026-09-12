import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DownloadScreen from "./DownloadScreen";
import { DialogProvider } from "../dialogs/DialogProvider";
import { DialogOpenProvider } from "../dialogGate";

vi.mock("../api", () => ({
  api: {
    listIssues: vi.fn().mockResolvedValue({
      issues: [
        { number: 1, title: "Issue 1", state: "open", labels: [], body: "b1" },
        { number: 2, title: "Issue 2", state: "open", labels: [], body: "b2" },
      ],
    }),
    listRepositoryLabels: vi.fn().mockResolvedValue([]),
    openSettings: vi.fn().mockResolvedValue({ masked_token: null, download_default_folder: null }),
  },
  onBackendEvent: () => () => {},
}));

function renderScreen(isActive) {
  return render(
    <DialogOpenProvider>
      <DialogProvider>
        <DownloadScreen
          isActive={isActive}
          currentRepo="octocat/hello-world"
          onOperationStateChange={() => {}}
          issuesMayBeStale={false}
          onIssuesRefreshed={() => {}}
        />
      </DialogProvider>
    </DialogOpenProvider>
  );
}

describe("DownloadScreen: Escape/Ctrl+A scoped to the active tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Ctrl+A selects all issues on the current page when the tab is active", async () => {
    renderScreen(true);
    const checkboxes = await screen.findAllByRole("checkbox");
    expect(checkboxes.every((c) => c.checked)).toBe(false);

    fireEvent.keyDown(window, { code: "KeyA", ctrlKey: true });
    expect(checkboxes.every((c) => c.checked)).toBe(true);
  });

  it("Ctrl+A does nothing when the tab is not active", async () => {
    renderScreen(false);
    const checkboxes = await screen.findAllByRole("checkbox");

    fireEvent.keyDown(window, { code: "KeyA", ctrlKey: true });
    expect(checkboxes.every((c) => c.checked)).toBe(false);
  });

  it("Escape clears selection when the tab is active", async () => {
    renderScreen(true);
    const checkboxes = await screen.findAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0]).toBeChecked();

    fireEvent.keyDown(window, { code: "Escape" });
    expect(checkboxes[0]).not.toBeChecked();
  });

  it("Escape does nothing when the tab is not active", async () => {
    renderScreen(false);
    const checkboxes = await screen.findAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0]).toBeChecked();

    fireEvent.keyDown(window, { code: "Escape" });
    expect(checkboxes[0]).toBeChecked();
  });
});
