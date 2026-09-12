import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import {
  DialogOpenProvider,
  useAnyDialogOpen,
  useRegisterDialogOpen,
} from "./dialogGate";

function Status() {
  const open = useAnyDialogOpen();
  return <div data-testid="status">{open ? "open" : "closed"}</div>;
}

function Registrant({ isOpen }) {
  useRegisterDialogOpen(isOpen);
  return null;
}

function Harness() {
  const [dialogAOpen, setDialogAOpen] = useState(false);
  const [dialogBOpen, setDialogBOpen] = useState(false);
  return (
    <DialogOpenProvider>
      <Status />
      <Registrant isOpen={dialogAOpen} />
      <Registrant isOpen={dialogBOpen} />
      <button onClick={() => setDialogAOpen(true)}>open A</button>
      <button onClick={() => setDialogAOpen(false)}>close A</button>
      <button onClick={() => setDialogBOpen(true)}>open B</button>
      <button onClick={() => setDialogBOpen(false)}>close B</button>
    </DialogOpenProvider>
  );
}

describe("dialogGate", () => {
  it("reports closed when nothing is registered as open", () => {
    render(<Harness />);
    expect(screen.getByTestId("status")).toHaveTextContent("closed");
  });

  it("reports open once a dialog registers itself as open", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("open A"));
    expect(await screen.findByText("open")).toBeInTheDocument();
  });

  it("reports open while at least one of several dialogs is open", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("open A"));
    fireEvent.click(screen.getByText("open B"));
    fireEvent.click(screen.getByText("close A"));
    expect(screen.getByTestId("status")).toHaveTextContent("open");
  });

  it("reports closed again once all dialogs close", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("open A"));
    fireEvent.click(screen.getByText("close A"));
    expect(screen.getByTestId("status")).toHaveTextContent("closed");
  });
});
