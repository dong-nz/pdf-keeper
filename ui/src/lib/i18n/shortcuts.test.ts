// AC-115 (UI-29 as modified) unit half: the two import shortcuts are catalog
// values — the empty-state keycaps and the menu accelerators read them from
// en.ts, and the keycap mechanism splits each combination on "+". The values
// are the single source for both surfaces; this test is what pins them.

import { describe, expect, it } from "vitest";
import en from "./en";

describe("import shortcut catalog values (UI-29, AC-115)", () => {
  it("the file import combination is a catalog value that splits into its keys", () => {
    expect(en["empty.library.keys"]).toBe("Ctrl+I");
    expect(en["empty.library.keys"].split("+")).toEqual(["Ctrl", "I"]);
  });

  it("the folder import combination is a catalog value that splits into its keys", () => {
    // DR-275: Ctrl+O — Ctrl+Shift+I is WebView2's DevTools accelerator in dev builds.
    expect(en["empty.library.keys.folder"]).toBe("Ctrl+O");
    expect(en["empty.library.keys.folder"].split("+")).toEqual(["Ctrl", "O"]);
  });

  it("the menu names the same combinations the empty state renders", () => {
    // Two surfaces, one pair of combinations: the menu accelerator strings
    // must not drift from the keycap strings (DR-270).
    expect(en["toolbar.importFiles.keys"]).toBe(en["empty.library.keys"]);
    expect(en["toolbar.importFolder.keys"]).toBe(en["empty.library.keys.folder"]);
  });
});
