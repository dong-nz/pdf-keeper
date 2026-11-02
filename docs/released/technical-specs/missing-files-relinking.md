# Missing files and relink — technical spec

**Status: Planned v0.0.1** (SPEC-v0.0.1.md FR-12; AC-05). Not implemented.

## Detection

- Checks run at **startup and on manual Rescan only** — no background watcher (DR-13b).
- `library_rescan()` / startup task: iterate `documents`, `fs::metadata` each path; on failure set `missing=1`; on success refresh `size`/`mtime` and enqueue a cover job when the mtime changed (FR-16).
- Runs in batches off the UI thread; progress and results surface via toast + status-bar counts (FR-15).
- Missing entries are NEVER auto-removed (FR-12).

## Missing state in queries

- `missing` badge in rows (UI-03); status-bar count query; opening a missing document short-circuits to the toast (see opening-and-deleting.md).

## Relink

- `library_relink_document(id, new_path)`: validate new_path is a `.pdf` and not already owned by another document (path UNIQUE). Update path, clear `missing`, re-stat size/mtime.
- If `title_source = auto`, the title is re-derived from the new filename (FR-12); user-edited titles are preserved (see metadata-editing.md).
- A cover job is enqueued for the new path.

## Tests / acceptance

- AC-05: move fixture outside app → rescan marks missing → relink restores (path updated, flag cleared); activation of a missing fixture produces the Relink toast.

## Change history
- v0.0.1 (planned): introduced.
