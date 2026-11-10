# Open containing folder — technical reference

**Since v0.0.8** · Requirements: UI-40 (ADDED) · User guide: [features/finding-a-documents-file.md](../features/finding-a-documents-file.md) · Spec: [SPEC-v0.0.8.md](../../specs/SPEC-v0.0.8.md) §2 (UI-40), §3.5 (design)

## Command (`src-tauri/src/commands.rs`, R1.2)

- `app_open_containing_folder(id)`: resolves the document row through the same typed resolution the reader-open command uses (`NotFound` / `Missing` typed errors when the row or file is gone), then calls `tauri_plugin_opener::reveal_item_in_dir([path])` — the Rust-side pattern of `app_open_data_dir`. The already-bundled opener plugin does the work; **no new dependency**.
- **Capability extension**: `src-tauri/capabilities/default.json` gained `"opener:allow-reveal-item-in-dir"` (the plugin previously granted only `opener:allow-open-path`).
- Whitelist + typed client (`ui/src/api.ts`) updated; the router/client parity test holds.

## UI (`ui/src/`)

- A `documentActions` entry (id `open_folder`, `folder` glyph already in the icon set, `applies: (doc) => !doc.missing`): the context-menu item and the Details-dialog footer action. Missing documents show no item — the same `applies` mechanism the released actions use; they keep *Relink*.
- The store method `revealInFolder(id)` sits on the released missing-file error path so a vanished file produces the typed error toast rather than a silent no-op.

## Test mapping

| Layer | Coverage |
|---|---|
| `scripts/ui-smoke.mjs` | `flowOpenFolder` (menu item present and the typed reveal request issued for the right id; the Details action opens the folder while the dialog stays open; the item is absent for a missing document; probe cleanup) — AC-111 |

The folder opening itself (the file manager selecting the file) is the Phase-B real-app observation recorded in the release verification; the harness verifies the request path end to end.

## Change history

- 2026-11-10 (v0.0.8 — UI-40) — First shipped. Migrated from SPEC-v0.0.8.md §3.5 as designed: `reveal_item_in_dir` on the bundled plugin, capability added, `applies: !missing` gating. Verified by `flowOpenFolder` (AC-111).
