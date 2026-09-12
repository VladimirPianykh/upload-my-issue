import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import UploadScreen from "./UploadScreen";
import { DialogProvider } from "../dialogs/DialogProvider";
import { DialogOpenProvider } from "../dialogGate";

vi.mock("../api", () => ({
  api: {
    getUploadQueue: vi.fn().mockResolvedValue([
      { id: "a", title: "A", original_filename: "a.md", body: "body a", labels: [], error: null },
      { id: "b", title: "B", original_filename: "b.md", body: "body b", labels: [], error: null },
    ]),
    listRepositoryLabels: vi.fn().mockResolvedValue([]),
    updateUploadItem: vi.fn().mockResolvedValue(null),
    removeUploadItems: vi.fn().mockResolvedValue([]),
  },
  onBackendEvent: () => () => {},
}));

function renderScreen(isActive) {
  return render(
    <DialogOpenProvider>
      <DialogProvider>
        <UploadScreen
          isActive={isActive}
          currentRepo="octocat/hello-world"
          hasToken={true}
          onOperationStateChange={() => {}}
        />
      </DialogProvider>
    </DialogOpenProvider>
  );
}

describe("UploadScreen: Escape/Ctrl+A scoped to the active tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("Ctrl+A selects all items when the tab is active", async () => {
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
});
