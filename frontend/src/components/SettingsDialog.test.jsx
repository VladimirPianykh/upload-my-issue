import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SettingsDialog from "./SettingsDialog";
import { DialogProvider } from "../dialogs/DialogProvider";
import { DialogOpenProvider, useAnyDialogOpen } from "../dialogGate";

vi.mock("../api", () => ({
  api: {
    openSettings: vi.fn().mockResolvedValue({ masked_token: null, download_default_folder: null }),
  },
}));

function Status() {
  const open = useAnyDialogOpen();
  return <div data-testid="status">{open ? "open" : "closed"}</div>;
}

describe("SettingsDialog registers with the dialog-open gate", () => {
  it("reports the gate as open while mounted", () => {
    render(
      <DialogOpenProvider>
        <DialogProvider>
          <Status />
          <SettingsDialog onClose={() => {}} onAccountChanged={() => {}} />
        </DialogProvider>
      </DialogOpenProvider>
    );
    expect(screen.getByTestId("status")).toHaveTextContent("open");
  });
});
