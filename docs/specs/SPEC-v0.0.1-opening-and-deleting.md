# Feature spec: Open & delete — v0.0.1

**Parent:** [SPEC-v0.0.1.md](SPEC-v0.0.1.md) · **Slug:** `opening-and-deleting` (docs/released pair) · **Lifecycle:** inherits the parent's registry status; frozen with the parent.

## Requirements

| ID | Requirement | Status |
|---|---|---|
| FR-08 | **Open externally.** Activating a document opens it with the OS default application for `.pdf`. Activating a **missing** document shows an error toast offering a **Relink…** action; no open is attempted. | **AGREED** (DR-04, DR-13c) |
| FR-09 | **Delete semantics.** Deleting offers both options per action: (a) remove from library only — disk file untouched; (b) delete file from disk — with confirmation. | **AGREED** (DR-06) |

Interacts with: SPEC-v0.0.1-missing-files-relinking.md (missing state, relink affordance).

## Acceptance criteria

| ID | Criterion | Verification method |
|---|---|---|
| AC-04 | Deleting via "library only" leaves the file on disk; "delete file" removes it (confirmed flow) | Automated test |

## Cross-references

Implementation design: `docs/released/technical-specs/opening-and-deleting.md` · User guide: `docs/released/features/opening-and-deleting.md`.
