import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import RepoDialog from "./RepoDialog";
import { DialogOpenProvider, useAnyDialogOpen } from "../dialogGate";

vi.mock("../api", () => ({
  api: {
    listRepositories: vi.fn().mockResolvedValue([]),
  },
}));

function Status() {
  const open = useAnyDialogOpen();
  return <div data-testid="status">{open ? "open" : "closed"}</div>;
}

describe("RepoDialog registers with the dialog-open gate", () => {
  it("reports the gate as open while mounted", () => {
    render(
      <DialogOpenProvider>
        <Status />
        <RepoDialog onClose={() => {}} onSelected={() => {}} />
      </DialogOpenProvider>
    );
    expect(screen.getByTestId("status")).toHaveTextContent("open");
  });
});
