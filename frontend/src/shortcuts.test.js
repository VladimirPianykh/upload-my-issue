import { describe, it, expect } from "vitest";
import { SHORTCUTS, matchesShortcut, isEditableTarget } from "./shortcuts";

function keyEvent({ code, ctrlKey = false, shiftKey = false, altKey = false }) {
  return { code, ctrlKey, shiftKey, altKey };
}

describe("SHORTCUTS.FOCUS_UPLOAD_TAB / FOCUS_DOWNLOAD_TAB (Ctrl+[ / Ctrl+])", () => {
  it("matches Ctrl+BracketLeft for FOCUS_UPLOAD_TAB regardless of keyboard layout", () => {
    const e = keyEvent({ code: "BracketLeft", ctrlKey: true });
    expect(matchesShortcut(e, SHORTCUTS.FOCUS_UPLOAD_TAB)).toBe(true);
  });

  it("matches Ctrl+BracketRight for FOCUS_DOWNLOAD_TAB regardless of keyboard layout", () => {
    const e = keyEvent({ code: "BracketRight", ctrlKey: true });
    expect(matchesShortcut(e, SHORTCUTS.FOCUS_DOWNLOAD_TAB)).toBe(true);
  });

  it("does not match when Shift is also held", () => {
    const e = keyEvent({ code: "BracketLeft", ctrlKey: true, shiftKey: true });
    expect(matchesShortcut(e, SHORTCUTS.FOCUS_UPLOAD_TAB)).toBe(false);
  });

  it("does not match when Alt is also held", () => {
    const e = keyEvent({ code: "BracketRight", ctrlKey: true, altKey: true });
    expect(matchesShortcut(e, SHORTCUTS.FOCUS_DOWNLOAD_TAB)).toBe(false);
  });

  it("does not match without Ctrl", () => {
    const e = keyEvent({ code: "BracketLeft", ctrlKey: false });
    expect(matchesShortcut(e, SHORTCUTS.FOCUS_UPLOAD_TAB)).toBe(false);
  });
});

describe("SHORTCUTS.DESELECT (Escape) and SHORTCUTS.SELECT_ALL (Ctrl+A)", () => {
  it("matches plain Escape for DESELECT", () => {
    const e = keyEvent({ code: "Escape" });
    expect(matchesShortcut(e, SHORTCUTS.DESELECT)).toBe(true);
  });

  it("matches Ctrl+A (physical KeyA) for SELECT_ALL regardless of layout", () => {
    const e = keyEvent({ code: "KeyA", ctrlKey: true });
    expect(matchesShortcut(e, SHORTCUTS.SELECT_ALL)).toBe(true);
  });

  it("does not match Ctrl+A when Shift is also held", () => {
    const e = keyEvent({ code: "KeyA", ctrlKey: true, shiftKey: true });
    expect(matchesShortcut(e, SHORTCUTS.SELECT_ALL)).toBe(false);
  });
});

describe("isEditableTarget", () => {
  it("treats an <input> element as editable", () => {
    expect(isEditableTarget({ tagName: "INPUT" })).toBe(true);
  });

  it("treats a <textarea> element as editable", () => {
    expect(isEditableTarget({ tagName: "TEXTAREA" })).toBe(true);
  });

  it("treats a plain element as not editable", () => {
    expect(isEditableTarget({ tagName: "DIV" })).toBe(false);
  });

  it("treats null/undefined as not editable", () => {
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(undefined)).toBe(false);
  });
});
