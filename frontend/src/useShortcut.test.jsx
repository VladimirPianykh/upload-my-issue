import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useShortcut, SHORTCUTS } from "./shortcuts";
import { DialogOpenProvider, useRegisterDialogOpen } from "./dialogGate";

function Listener({ onFire }) {
  useShortcut(SHORTCUTS.DESELECT, onFire);
  return null;
}

function Dialog() {
  useRegisterDialogOpen(true);
  return null;
}

function Harness({ onFire, dialogOpen }) {
  return (
    <DialogOpenProvider>
      <Listener onFire={onFire} />
      {dialogOpen && <Dialog />}
    </DialogOpenProvider>
  );
}

describe("useShortcut + dialog gating", () => {
  it("fires the handler on a matching keydown when no dialog is open", () => {
    const onFire = vi.fn();
    render(<Harness onFire={onFire} dialogOpen={false} />);
    fireEvent.keyDown(window, { code: "Escape" });
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("does not fire the handler while an internal dialog is open", () => {
    const onFire = vi.fn();
    render(<Harness onFire={onFire} dialogOpen={true} />);
    fireEvent.keyDown(window, { code: "Escape" });
    expect(onFire).not.toHaveBeenCalled();
  });
});
