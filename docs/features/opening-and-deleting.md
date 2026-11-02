# Opening and deleting

> **Status: 📝 Draft** — agreed in SPEC-v1.0.0 (FR-08, FR-09); not implemented yet.

## Opening (FR-08)
Double-click a document (or Enter, or the Open action) — it opens in your system's default application for PDF files. If the file is missing, an error toast offers **Relink…** instead ([missing-files-relinking.md](missing-files-relinking.md)).

## Deleting (FR-09)
The Delete action offers both choices every time:
1. **Remove from library** — the entry is deleted; your file on disk is untouched.
2. **Delete file from disk** — asks for confirmation, then removes the file itself.

Bulk delete works the same way for a multi-selection.
