# Feature spec: Search — v0.0.1

**Parent:** [SPEC-v0.0.1.md](SPEC-v0.0.1.md) · **Slug:** `searching` (docs/released pair) · **Lifecycle:** inherits the parent's registry status; frozen with the parent.

## Requirements

| ID | Requirement | Status |
|---|---|---|
| FR-03 | **Search.** Instant search as the user types, matching against: title, filename, author, notes. Prefix matching (typing `repo` finds "Report"). Search combines with a category filter and the favorites filter (AND semantics). No full-text/content search. | **AGREED** scope (DR-01); instant UX is part of P1 |

Depends on: parent §4 NFR-02 (search < 100 ms at 10 000 docs), NFR-07 (debounce ~150 ms), §6 (FTS5 index over title/filename/author/notes).

## Acceptance criteria

| ID | Criterion | Verification method |
|---|---|---|
| AC-02 | Search returns correct results for title/filename/author/notes prefixes within the NFR-02 budget (< 100 ms at 10 000 docs) | Automated test with timing assertion |

## Cross-references

Implementation design: `docs/released/technical-specs/searching.md` · User guide: `docs/released/features/searching.md`.
