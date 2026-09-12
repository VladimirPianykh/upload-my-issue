import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DialogProvider, useDialog } from "./DialogProvider";
import { DialogOpenProvider, useAnyDialogOpen } from "../dialogGate";

function Status() {
  const open = useAnyDialogOpen();
  return <div data-testid="status">{open ? "open" : "closed"}</div>;
}

function AskButton() {
  const ask = useDialog();
  return (
    <button
      onClick={() =>
        ask({
          title: "Confirm?",
          options: [{ value: "ok", label: "OK" }],
        })
      }
    >
      ask
    </button>
  );
}

function Harness() {
  return (
    <DialogOpenProvider>
      <DialogProvider>
        <Status />
        <AskButton />
      </DialogProvider>
    </DialogOpenProvider>
  );
}

describe("DialogProvider registers with the dialog-open gate", () => {
  it("reports the gate as open while its modal is visible, and closed once answered", () => {
    render(<Harness />);
    expect(screen.getByTestId("status")).toHaveTextContent("closed");

    fireEvent.click(screen.getByText("ask"));
    expect(screen.getByTestId("status")).toHaveTextContent("open");

    fireEvent.click(screen.getByText("OK"));
    expect(screen.getByTestId("status")).toHaveTextContent("closed");
  });
});
