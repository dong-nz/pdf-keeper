# Password-protected PDFs — technical reference

**Since v0.0.8** · Requirements: FR-20 (ADDED) · User guide: [features/password-protected-pdfs.md](../features/password-protected-pdfs.md) · Spec: [SPEC-v0.0.8.md](../../specs/SPEC-v0.0.8.md) §2 (FR-20), §3.3 (design) — decisions DR-257 (OQ-49 closed as C: opt-in storage with *Remember this password* / *Remove password*), DR-266 (unlock mechanism, stored-wrong edge)

## Model (`src-tauri/src/`)

- **No new dependency (M2)**: pdfium's loader already accepted a password — every load site previously passed `None`. The render paths (`pdf/mod.rs`, the reader service, the covers queue) now pass the row's stored password when present, otherwise `None`.
- **Typed error**: pdfium's `InvalidPassword` signal maps to `AppError::PasswordRequired { path }` → the error payload kind `password-required` (R3.2). It is the only path a protected file takes; other load failures keep their existing typed variants.
- **Storage (opt-in, OQ-49 C)**: `documents.pdf_password TEXT NOT NULL DEFAULT ''` — part of the clean `SCHEMA_BASELINE`; version-1 databases get it via `ALTER TABLE` in `UPGRADE_V1_TO_V2`. Written **only** through `library_set_password(id, password)` — the single channel (DR-266: the reader writes the typed password there before the render retry; the window's close paths clear an unchecked, non-remembered value with `library_set_password(id, "")`). Plaintext in the user's own library database — the same trust model as notes.
- **Covers (AC-106)**: a protected document with no stored password keeps the glyph fallback (`covers::tests::a_protected_document_gets_no_cover_until_its_password_is_stored`); after a remembered unlock the document is re-enqueued and the real cover replaces the glyph (the DR-231 appearance path unchanged). The covers queue passes the stored password.
- **Metadata unchanged**: the encrypted-file parser still returns nothing; the title falls back to the filename rule — the documented limitation.

## Commands (thin wrappers, R1.2)

- `app_pdf_page` / `app_pdf_outline` / `app_pdf_document` keep their signatures — the service reads the stored password from the row itself.
- `library_set_password(id, password)` — new; set and clear. Whitelist + typed client updated.

## Reader UI (`ui/src/ReaderApp.svelte`)

- On a `password-required` payload the error state renders the **unlock form**: password field (native `type="password"`), *Remember this password* checkbox (unchecked by default), *Unlock*. A wrong password keeps the form with the inline `field-error` treatment and the window stays usable; Enter submits.
- With a stored password the field pre-fills and the form offers *Remove password* (clears the column; the next open prompts again). A stored-but-wrong password re-prompts rather than erroring the window (DR-266).
- A successful unlock re-renders the page stack **in the same window** — no second window, no app reload.

## Test mapping

| Layer | Coverage |
|---|---|
| `src-tauri/src/pdf` | `a_protected_document_prompts_and_unlocks_with_the_right_password` (typed prompt, unlock, `render_cover` assertions) |
| `src-tauri/src/library` | `stored_password_round_trips_and_requeues_the_cover` |
| `src-tauri/src/covers` | `a_protected_document_gets_no_cover_until_its_password_is_stored` |
| `scripts/ui-smoke.mjs` | `flowProtected` (12 checks: prompt-not-error, wrong password keeps the form with the inline error, unlock renders the true page count, prefill + *Remove*, the stored-but-wrong edge, unchecked stores nothing, remembered opens directly) |

## Change history

- 2026-11-10 (v0.0.8 — FR-20) — First shipped. Migrated from SPEC-v0.0.8.md §3.3, corrected to the code as verified: opt-in storage with the close-path clearing rule (DR-266). Verified by the Rust tests above and `flowProtected` (AC-104, AC-105, AC-106).
