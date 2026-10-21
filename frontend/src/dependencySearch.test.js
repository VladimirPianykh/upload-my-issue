import { describe, it, expect } from "vitest";
import {
  DEPENDENCY_CONSTRUCTS,
  applyConstruct,
  getAutocompleteContext,
  removeFilterText,
} from "./dependencySearch";

// В строках "|" обозначает позицию каретки.
const at = (marked) => {
  const caret = marked.indexOf("|");
  return [marked.replace("|", ""), caret];
};
const ctx = (marked) => getAutocompleteContext(...at(marked));

describe("constructs registry", () => {
  it("maps constructs to filter modes as in the spec", () => {
    const modes = Object.fromEntries(DEPENDENCY_CONSTRUCTS.map((c) => [c.token, c.mode]));
    expect(modes).toEqual({
      "!dep#": "dependencies",
      "!idep#": "dependents",
      "!rel#": "relates_to",
      "!con#": "connected",
    });
  });

  it("has neither duplicate tokens, nor duplicate modes, nor duplicate labels", () => {
    for (const key of ["token", "mode", "label"]) {
      const values = DEPENDENCY_CONSTRUCTS.map((c) => c[key]);
      expect(new Set(values).size).toBe(values.length);
    }
  });
});

describe("construct autocomplete (after typing '!')", () => {
  it("offers every construct right after '!'", () => {
    const c = ctx("fix !|");
    expect(c.kind).toBe("construct");
    expect(c.options.map((o) => o.token)).toEqual(["!dep#", "!idep#", "!rel#", "!con#"]);
  });

  it("narrows options by the typed prefix", () => {
    expect(ctx("!i|").options.map((o) => o.token)).toEqual(["!idep#"]);
    expect(ctx("!de|").options.map((o) => o.token)).toEqual(["!dep#"]);
    expect(ctx("!c|").options.map((o) => o.token)).toEqual(["!con#"]);
    expect(ctx("!r|").options.map((o) => o.token)).toEqual(["!rel#"]);
  });

  it("is closed when nothing matches or there is no '!'", () => {
    expect(ctx("!x|")).toBeNull();
    expect(ctx("abc|")).toBeNull();
    expect(ctx("|")).toBeNull();
  });

  it("is closed once the caret leaves the word", () => {
    expect(ctx("!de |")).toBeNull();
    expect(ctx("!| abc")).not.toBeNull();
    expect(ctx("!de |p")).toBeNull();
  });

  it("applying a construct replaces the typed prefix and moves the caret after '#'", () => {
    const [text, caret] = at("a !i| b");
    const context = getAutocompleteContext(text, caret);
    expect(applyConstruct(text, context, context.options[0])).toEqual({
      text: "a !idep# b",
      caret: "a !idep#".length,
    });
  });
});

describe("issue autocomplete (after a construct)", () => {
  it("opens right after '#'", () => {
    expect(ctx("!dep#|")).toMatchObject({
      kind: "issue",
      query: "",
      construct: { token: "!dep#", mode: "dependencies" },
    });
  });

  it("opens inside and at the end of the word after '#'", () => {
    expect(ctx("!idep#lo|gin").query).toBe("login");
    expect(ctx("!idep#login|").query).toBe("login");
    expect(ctx("!rel#login|").construct.mode).toBe("relates_to");
    expect(ctx("!con#login|").construct.mode).toBe("connected");
  });

  it("includes the position right before the first whitespace but not after it", () => {
    expect(ctx("!dep#login| next")).not.toBeNull();
    expect(ctx("!dep#login |next")).toBeNull();
    expect(ctx("!dep#login next|")).toBeNull();
  });

  it("is closed when the caret is inside the construct itself or before it", () => {
    expect(ctx("!de|p#login")).toBeNull();
    expect(ctx("|!dep#login")).toBeNull();
  });

  it("works for a construct in the middle of ordinary text", () => {
    const c = ctx("fix !dep#log| crash");
    expect(c).toMatchObject({ kind: "issue", query: "log" });
    expect([c.start, c.end]).toEqual([4, 12]);
  });

  it("with several constructs only the one under the caret is active", () => {
    expect(ctx("!dep#aa| !idep#bb").construct.token).toBe("!dep#");
    expect(ctx("!dep#aa !idep#b|b").construct.token).toBe("!idep#");
    expect(ctx("!dep#aa !idep#bb |")).toBeNull();
  });

  it("requires the construct to start a word", () => {
    expect(ctx("x!dep#a|")).toBeNull();
  });

  it("treats a second construct glued to the first one as part of its text", () => {
    expect(ctx("!dep#a!idep#|b")).toMatchObject({
      construct: { token: "!dep#" },
      query: "a!idep#b",
    });
  });

  it("behaves the same for pasted text, since it only depends on text and caret", () => {
    // вставили "!dep#pasted" - каретка в конце слова, список открыт
    expect(ctx("!dep#pasted|").query).toBe("pasted");
    // вставили "!dep#pasted title" - каретка уже за словом, список закрыт
    expect(ctx("!dep#pasted title|")).toBeNull();
  });
});

describe("removeFilterText", () => {
  it("removes exactly the construct and its word, keeping everything else unchanged", () => {
    const [text, caret] = at("fix !dep#log| crash");
    const context = getAutocompleteContext(text, caret);
    expect(removeFilterText(text, context)).toEqual({ text: "fix  crash", caret: 4 });
  });

  it("leaves other constructs untouched", () => {
    const [text, caret] = at("!dep#a !idep#b|");
    const context = getAutocompleteContext(text, caret);
    expect(removeFilterText(text, context).text).toBe("!dep#a ");
  });
});
