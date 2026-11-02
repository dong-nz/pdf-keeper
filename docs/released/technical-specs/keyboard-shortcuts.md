# Keyboard operability — technical spec

**Status: Planned v0.0.1** (SPEC-v0.0.1.md NFR-06). Not implemented.
**Feature spec:** none — cross-cutting page (requirements in parent SPEC-v0.0.1.md)

## Bindings (NFR-06)

| Keys | Action | Implementation |
|---|---|---|
| Ctrl+F / Cmd+F | Focus search box | Global keydown handler in the app shell; `Cmd` via Tauri platform detection |
| Ctrl+I / Cmd+I | Import PDFs | Same handler → toolbar action |
| Enter | Open selected document | Row/grid focus handler → `app_open_document` |
| Delete | Delete flow for selection | Row focus handler → delete dialog |
| Esc | Close dialog / clear selection / clear search | Context-sensitive: innermost active consumer wins |
| ↑ ↓ | Navigate rows | Roving tabindex over the virtualized window |

## Rules

- All bindings are scoped: they do NOT fire while a text input owns focus (typing `f` in notes must not steal focus).
- Modals trap focus until closed (Esc or explicit close) — no focus leaks to the list behind.
- The full app must be operable without a mouse: sidebar, toolbar, rows, bulk bar, dialogs (NFR-06).

## Tests / acceptance

- UI smoke script drives the flows by keyboard only (import → search → open → delete).

## Change history
- v0.0.1 (planned): introduced.
