# Sorting and views — technical spec

**Status: Planned v0.0.1** (SPEC-v0.0.1.md FR-13, FR-14; NFR-01; UI-01/03/04). Not implemented.

## Sorting

- Allowed keys: `title`, `date_added`, `size`; directions asc/desc. The command layer maps sort parameters through a **whitelist** — no free-form SQL, so no injection surface.
- Default: title A→Z (UI-04); favorites always first (see favorites.md).
- Choice persisted in app settings (user-data directory), restored at startup.

## Views (virtualization, NFR-01)

- **List:** table rows — checkbox, star, cover thumbnail, title, category badges, filename, size, date added, missing badge, actions (UI-03).
- **Grid:** cards, cover as card image.
- Both views render only the visible window plus a small overscan buffer; row height fixed per mode so the scroll window is computable. DOM node count stays bounded at tens of thousands of documents.
- Row data arrives as slices from `library_search` (offset/limit) — the client never loads the whole library.
- View choice persisted in app settings.

## Tests / acceptance

- Query-builder unit tests: whitelist mapping, ordering composition, slice correctness.
- Virtualization is proven in the UI smoke script (frame budget at fixture scale), not unit-tested.

## Change history
- v0.0.1 (planned): introduced.
