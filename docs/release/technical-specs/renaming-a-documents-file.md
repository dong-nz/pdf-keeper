# Renaming a document's file — technical reference

**Since v0.0.8** · Requirements: FR-21 (ADDED) · User guide: [features/renaming-a-documents-file.md](../features/renaming-a-documents-file.md) · Spec: [SPEC-v0.0.8.md](../../specs/SPEC-v0.0.8.md) §2 (FR-21), §3.4 (design) — decisions DR-265 (the full-name accept, extension not pinned), DR-267 (action composition, dialog component), DR-268 (label without "…", folder line)

## Service (`src-tauri/src/library/service.rs`)

`rename_document(conn, id, new_name)` runs the ordered sequence:

1. **Validate** `new_name`: non-empty, no path separators, no reserved characters (`<>:"/\|?*`), no trailing dot or space — typed `AppError::InvalidName`. The full name is accepted; the extension is not pinned (DR-265).
2. **Collision**: the resulting path equals another document's `path` (the UNIQUE constraint) **or** a file already exists at that path in the same folder — typed `NameConflict`; no filesystem or DB change happened.
3. `std::fs::rename(old, new)`; failure → typed `Io`, record untouched.
4. **One transaction**: `UPDATE documents SET path = ?, filename = ?`, plus `title` re-derived from the new filename **only when `title_source = 'auto'`** (AC-109 — a user title is never rewritten). If the DB write fails the file is renamed back (compensating rename) and the error returned — record and disk stay consistent.
5. **Identity preserved**: tags, favorite, notes, `reading`, `pdf_password` all travel with the row — the rename writes only `path` / `filename` (and the conditional title). The cover is enqueued under the new key (the cache key composes from the path, M3); the stale entry is removed by the existing orphan sweep (`covers::tests::a_renamed_document_renders_under_the_new_key_and_the_stale_entry_is_swept`).

Relink and missing-detection need no change: they resolve by `documents.path`, which is the new path (`flowRename` re-verifies both against the renamed file).

## Commands (thin wrappers, R1.2)

- `app_rename_document(id, new_name)` — whitelist + typed client updated.

## UI (`ui/src/`)

- The action is a `documentActions` entry (id `rename`, new internal `pencil` stroke glyph, `applies: (doc) => !doc.missing`) — rendered in the context menu and as a Details-dialog footer action; it does **not** join the row/card compact action set (DR-267). Label **Rename**, no ellipsis (UI-20 rule, DR-268).
- `RenameDocumentDialog.svelte` follows the released `RenameTagDialog` pattern: local `open` bound into `Modal`, field prefilled with the current name, the containing folder shown read-only above it (no native `title` attribute — the AC-87 ban; the path wraps), inline errors on the `.field` with `role="alert"` for `InvalidName` / `NameConflict`, Enter submits, Esc closes, the dialog stays open on rejection.
- On success the store update re-derives the row; the open Details dialog follows the new name through the DR-231 re-read path (`onrenamed` hook).

## Test mapping

| Layer | Coverage |
|---|---|
| `src-tauri/src/library` | `rename_moves_the_file_and_the_record_and_preserves_identity` (AC-107), `rename_rejects_invalid_and_colliding_names_and_changes_nothing` (AC-108), `a_user_title_survives_the_rename_an_auto_title_re_derives` (AC-109) |
| `src-tauri/src/covers` | `a_renamed_document_renders_under_the_new_key_and_the_stale_entry_is_swept` (AC-110) |
| `scripts/ui-smoke.mjs` | `flowRename` (17 checks against a private probe copy, records cleaned: file + record move together, tags/notes/favorite/Reading/password survive, collision and invalid names rejected with the inline error while the dialog stays open and nothing changes, relink and missing-detection follow the new path, the auto title re-derives) |

## Change history

- 2026-11-10 (v0.0.8 — FR-21) — First shipped. Migrated from SPEC-v0.0.8.md §3.4, corrected to the code as verified: `pencil` glyph and dialog component per DR-267, label wording per DR-268, full-name validation per DR-265. Verified by the Rust tests above and `flowRename` (AC-107…AC-110).
