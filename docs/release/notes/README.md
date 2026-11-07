# Release Notes

One page per shipped version, in plain end-user language: what a release changed for you, what it does not do yet, and what is known to be wrong in it. No requirement numbers, no technology names.

Pages are written **in the release Ship commit**, from that release's change summary and the guide changes it produced, and are **never edited afterwards** — corrections to how a feature behaves belong in `docs/release/features/` (as an Amendment note) and in `docs/release/technical-specs/` (as a change-history entry). A page therefore stays a faithful record of what that version said at the time it shipped.

## Release map

| Version | Page | Status |
|---|---|---|
| v0.0.1 | [v0.0.1.md](v0.0.1.md) | ✅ Released 2026-11-03 (page written retrospectively the same day, from the shipped documentation) |
| v0.0.2 | [v0.0.2.md](v0.0.2.md) | ✅ Released 2026-11-04 |
| v0.0.3 | [v0.0.3.md](v0.0.3.md) | ✅ Released 2026-11-04 |
| v0.0.4 | [v0.0.4.md](v0.0.4.md) | ✅ Released 2026-11-05 |
| v0.0.5 | [v0.0.5.md](v0.0.5.md) | ✅ Released 2026-11-06 |
| v0.0.6 | [v0.0.6.md](v0.0.6.md) | ✅ Released 2026-11-07 |

## Rules (AGENTS §2a, RULES R8.5)

- A page is created only for a **RELEASED** version; nothing here describes unreleased behavior.
- Content comes from the shipped release spec's change summary, the user-guide pages that release updated, and the verified limitations of the build — never from plans.
- Patch releases get their own page too (they have no spec file: their content is the fixed bugs).
- Pages are never edited, deleted, or merged after Ship.

## Cross-references

- Current behavior: `docs/release/features/`
- How it is built: `docs/release/technical-specs/`
- Requirements and lifecycle registry: `docs/specs/INDEX.md`
