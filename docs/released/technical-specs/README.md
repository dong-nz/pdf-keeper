# Technical Specs — Released Developer Reference

Deep technical documentation **of released features only**: design, modules, data model, invariants, and test mapping as they were shipped. For developers and coding agents; end users read `docs/released/features/` instead.

One document per feature, same slug as its user-guide page. The binding requirement text always lives in the release specs (`docs/specs/INDEX.md`); the **development-time technical design lives in the current (not yet released) spec and its feature specs** — never here. A document in this directory appears only at the release Ship commit, migrated from the design sections of the spec that shipped the feature (DR-39), and carries a per-release change history.

## Feature map

Populated at Ship commits; **empty until v0.0.1 ships** (v0.0.1 is APPROVED — its technical design lives in `docs/specs/SPEC-v0.0.1*.md`).

| Technical doc | Released since | User guide page | Requirements |
|---|---|---|---|
| — | — | — | — |

## Creation & maintenance rules (AGENTS §2a, RULES R8.5/R8.6)

- A document is **created in the Ship commit** of the release that first ships the capability: content migrated from that release spec's feature-spec "Technical design" section (cross-cutting features: parent §5.1/§5.2), corrected to match the code **as released and verified**, marked "Since vX.Y.Z".
- Every later release that touches the feature appends a dated change-history entry ("v0.1.0: …") and updates the design sections to match the code as released.
- Documents are never deleted; removed features stay with a "Removed in v…" marker.
- Current specs MUST NOT link into this directory — they carry their own design sections; this directory describes only what has shipped.

## Cross-references

- Requirements authority + development-time design: `docs/specs/SPEC-v*.md` (via INDEX)
- User-facing behavior: `docs/released/features/`
- Code rules: `RULES.md`
