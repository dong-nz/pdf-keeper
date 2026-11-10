# SPEC-v0.0.9 — EPUB support (library + in-app reading)

**Version:** v0.0.9
**Status:** PROPOSED (drafted in advance 2026-11-10 at the user's request; version name carried from the user's request; confirmed at approval)
**Parent spec:** this file is the release parent
**Feature specs:** none (single feature area)
**Baseline:** `docs/specs/SPEC-v0.0.7.md` (RELEASED, frozen) **plus `docs/specs/SPEC-v0.0.8.md` as approved and in build (ON-GOING from 2026-11-10, the user's "implement v0.0.8", spec DR-265 — the approved text is the drafted text unchanged)**. This draft describes only what v0.0.9 adds on top of what v0.0.8 will release: the tags vocabulary and commands (v0.0.8 UI-42), the Reading collection (FR-19), rename (FR-21), open-containing-folder (UI-40) and the import-label row (UI-44). **Dependency: v0.0.9 presumes v0.0.8 ships as drafted. If v0.0.8 changes during its review, this draft is reconciled before its own approval** (its MODIFIED rows quote v0.0.8 draft text and say so).

---

## 0. Scope and versioning

**What this release is.** EPUB support end-to-end, as extended by the user's decision of 2026-11-10 (DR-262 — the roadmap's Phase 1/Phase 2 split is merged into this release): **EPUB documents become first-class library members** — import, metadata, cover, OS-application open, and every existing library capability (tags, favorites, Reading, search, rename, relink, missing detection, bulk operations, Details) applies to them exactly as to PDFs — **and the app reads EPUBs inside itself**: a dedicated reader window for reflowable EPUB content (FR-23). The technical approach for the reading half — who lays out the book: the bundled web engine with Rust serving it, or Rust itself — is the release's central open question: options and trade-offs §3.9, decision OQ-57.

**What this release is not (out of scope):**
- **Full-text search** (out of scope since v0.0.1; applies to EPUB content the same way as to PDF text).
- **EPUB encryption and DRM** (the FR-20 password concept is a PDF fact; a DRM-encumbered EPUB opens with the OS application — the app does not license a DRM engine).
- **Page numbers / pagination facts** (EPUB has no stable pages; the library never shows page facts).
- Depending on the OQ-57 decision: paginated page-turn mode and facing spreads — option A defers them to a later release (§3.11); option B ships them with its library.

**Version bump (0.0.8 → 0.0.9, minor on the 0.x line):** a new document type managed by the library, and a new reading surface for it. The user's request named the version; the bump matches the roadmap's line 2. Agent proposes nothing about the number — the user set it.

**ID policy:** consumes `FR-22` (EPUB library support) and `FR-23` (in-app EPUB reader) — **the app-updates reservation moves a fifth time; that move is OQ-52** (the user's decision; the reservation returns at `FR-24`+; the fourth move was v0.0.8's closed OQ-46, per DR-264). New UI items `UI-46`–`UI-48` (`UI-48`: the EPUB reading surface — its text finalizes with OQ-57/OQ-58). One MODIFIED requirement carried as a row: `FR-17` (activation behavior for EPUB documents — OQ-54 decides). One MODIFIED row carried conditionally: `UI-44` (the import labels revisited exactly as the v0.0.8 draft promised — OQ-55). No new NFR (the import budget NFR-01 covers the new file type; the reader surface follows the released NFR-09 budget pattern in its tests). No new defects (new feature; the D-list stays as v0.0.8 left it). Acceptance criteria `AC-121`+.

---

## 1. Change summary

| ID | Change | Stage |
|---|---|---|
| FR-22 | **New**: EPUB library support — import, metadata from the package, cover from the declared cover image, OS-application open, all library capabilities (OQ-52 decides the ID reservation) | Rust core → commands → UI |
| UI-46 | **New**: import accepts `.epub` (picker, folder scan, drag-and-drop) with typed rejection for other types; type-matched relink | Rust core → UI |
| UI-47 | **New**: type visibility in the library (OQ-56 decides the semantics; recommendation: none — type-agnostic) | UI |
| FR-23 | **New**: in-app EPUB reader — a dedicated reader window for reflowable EPUB content; the approach is OQ-57 (§3.9) | Rust core → commands → UI |
| UI-48 | **New**: the EPUB reading surface — window, controls, typography (text finalizes with OQ-57/OQ-58) | UI |
| FR-17 | **Modified**: activation semantics for EPUB documents — OQ-54 decides (recommendation: activation opens the in-app EPUB reader) | UI |
| UI-44 | **Modified** (conditional, per the v0.0.8 promise): import labels revisited now that two types exist — OQ-55 decides (recommendation: "Import files") | UI |
| — | New Rust dependency (EPUB parsing): **OQ-53 decides the crates** — an AGENTS §2 approval by its answer, recorded in the Decision Log | Rust core |
| — | If OQ-57 B is chosen: a new **frontend** dependency (the reading library) — also an AGENTS §2 approval, and an explicit R1.1 exception decision (Rule 7) | UI |
| — | App naming: **OQ-59 decides** whether the app renames (recommendation: keep "PDF Keeper" through 0.x) | UI + docs, if chosen |

---

## 2. Requirements

New items are binding once the release is approved. All are **PROPOSED**.

**FR-22 (EPUB library support)** — **new** (consumes `FR-22` per OQ-52):
*The app manages EPUB documents in the same library as PDF documents. Importing `.epub` files — through the file picker, folder import, and drag-and-drop — registers them as library documents; the document's facts are read from the EPUB package itself: title and author from its published metadata, cover from the cover image the package declares (a package that declares none, or whose cover cannot be decoded, uses the released glyph fallback). The released title-fallback rule (filename when metadata is absent or unusable) applies unchanged. Every library capability applies to EPUB documents exactly as to PDF documents: tags, favorites, the Reading collection, search, rename, relink, missing detection, bulk operations, Details, the status bar. Reading an EPUB happens in the app's own reader (FR-23); opening with the OS default application remains available as an explicit action (activation semantics per OQ-54). The password concept (FR-20) is a PDF fact and never applies to EPUB.*

**FR-23 (In-app EPUB reader)** — **new** (consumes `FR-23` per OQ-52; the surface depends on OQ-57/OQ-58 — the invariant core is stated here, the approach-dependent parts as placeholders):
*The app displays and reads EPUB documents inside itself: opening an EPUB shows its content in a dedicated reader window (one window per document — the released FR-17 window pattern), navigable through the whole book by table of contents and by flow, with reading typography the app controls (at minimum text size) [OQ-57 A: continuous flow in the app's typography; option B adds a paginated page-turn mode through a frontend library; option C: page images laid out in Rust]. Reading an EPUB does not require an external application. Opening with the OS default application remains available as an explicit action. A document whose file is missing, or a package the app cannot render, never opens silently: the typed error paths of FR-08 apply, and an unrenderable file additionally offers the OS-application open. The Reading-collection semantics (v0.0.8 FR-19: manual-only membership) are untouched.*

**UI-46 (Import accepts EPUB)** — **new**:
*The file picker's filter accepts `.pdf` and `.epub` together; folder import collects both types in one walk; dropped files of either type enter the import pipeline; files of other extensions keep the existing typed rejection, whose message names the supported types. Relink presents the file type matching the document's own extension and refuses a mismatch with a typed error.*

**UI-47 (Type visibility)** — **new** (semantics pending OQ-56; the text below is the recommended option A):
*[OQ-56 A recommended] Rows and cards keep their released content unchanged — the library is type-agnostic: no format badge, no format glyph, no format filter. The file type is visible where it already is: the extension in the filename shown on rows, cards, and Details. [OQ-56 B alternative: a small format glyph on rows/cards only — the design would define its glyph, placement, and grid treatment. OQ-56 C alternative: a format filter in the Browse menu — the design would define its interaction with Browse modes and saved filters.]*

**UI-48 (EPUB reading surface)** — **new** (its text is finalized only when OQ-57/OQ-58 are answered; the recommended option A's shape is stated as the draft):
*[OQ-57 A draft] The reader window for an EPUB: the released window chrome and one-window-per-document pattern (FR-17 design); the released bottom control strip (UI-30 surface) carries text-size controls (in place of zoom), a table-of-contents control (the released UI-33 pattern, fed by the package spine), and a progress readout expressed as book position (percent through the spine — EPUB has no page numbers); the content surface renders chapters in continuous flow with the app's reading typography (§3.9). [Option B draft: the strip adds page-turn and spread controls per the chosen library's capabilities. Option C draft: the strip mirrors the PDF reader's controls over rendered pages.]*

**FR-17 (Built-in PDF reader)** — **MODIFIED** (activation behavior for EPUB documents; OQ-54 decides; the reader capability itself is unchanged):
Old text (RELEASED, `SPEC-v0.0.7.md` §2 new text): *"The app displays and reads PDF documents inside itself: opening a document shows its pages in a dedicated reader window (one window per document — OQ-37 closed, DR-139), navigable to every page and zoomable (fit-width and fixed zoom steps), and viewable in the mode the user selects: single page, continuous, or facing (UI-34). Reading does not require an external application. Opening a document with the OS default application remains available as an explicit action. A document whose file is missing, or a file that cannot be rendered, never opens silently: the typed error paths of FR-08 apply, and an unrenderable file additionally offers the external-open action."*
New text (OQ-54 A recommended): *The app displays and reads PDF documents inside itself: opening a document shows its pages in a dedicated reader window (one window per document — OQ-37 closed, DR-139), navigable to every page and zoomable (fit-width and fixed zoom steps), and viewable in the mode the user selects: single page, continuous, or facing (UI-34). Reading does not require an external application. Opening a document with the OS default application remains available as an explicit action. **For EPUB documents, activation opens the app's own EPUB reader (FR-23)** [OQ-54 A; option B: activation opens the OS default application and the in-app reader opens from the context menu]. A document whose file is missing, or a file that cannot be rendered, never opens silently: the typed error paths of FR-08 apply, and an unrenderable file additionally offers the external-open action.*

**UI-44 (Import labels)** — **MODIFIED** (conditional; this is the revisit the v0.0.8 draft promised when a non-PDF type entered the library; OQ-55 decides):
Old text (verbatim from `SPEC-v0.0.8.md` §2 — **v0.0.8 is unreleased; this row is reconciled if v0.0.8 changes**): *"**The import labels name what is imported.** The toolbar's import menu items read **Import PDFs** and **Import folder**. This supersedes the values *Import files* / *Import folder* set by DR-211: the label states what the picker accepts, and today that is PDF files only. Tooltips, the empty-state hint's words, dialog titles, and the flows' label assertions follow the new values. When a non-PDF type enters the library (the roadmap EPUB candidate), that release revisits the label."*
New text (OQ-55 A recommended): *With two managed types in the library the values UI-44 changed — the import menu items, their tooltips, the empty-state hint's words, dialog titles — read **"Import files"** [OQ-55 A; option B: "Import PDFs & EPUBs"]; the flows' label assertions follow. The empty-state hint names both file types (the UI-29 structure unchanged). No control names one type while the library accepts both; the toolbar menu trigger keeps the bare "Import" label exactly as v0.0.8 leaves it.*

---

## 3. Technical design

### 3.1 Verified baseline facts (2026-11-10)

| # | Fact | Source |
|---|---|---|
| M10 | The import picker filters to PDF: `PDF_FILTERS = [{ name: "PDF", extensions: ["pdf"] }]` (`ui/src/lib/importFlow.ts:7`); `RelinkDialog.svelte:13` carries its own copy; a typed `not_pdf` rejection flows from the service to the client (`library.svelte.ts:312`) | verified |
| M11 | Folder import walks for `*.pdf` only (`src-tauri/src/library/service.rs:376`, DR-50a) | verified |
| M12 | Drag-and-drop import passes dropped paths through the pipeline with a `.pdf` filter (`ui/src/App.svelte:117-118`) | verified |
| M13 | External open is `tauri_plugin_opener::open_path` in commands (`src-tauri/src/commands.rs:363`): the OS resolves the default application per file type — an EPUB needs no backend change on this path | verified (the OS-handler behavior is the plugin's) |
| M14 | `Cargo.toml` carries no zip or XML crate (verified 2026-11-10); `image` and `lopdf` exist; pdfium renders PDF pages only | verified |
| M15 | The test fixture corpus is generated by `scripts/make-fixtures.mjs` (R6: scripts generate fixtures; no committed binaries) | verified |
| M16 | EPUB format facts (stable knowledge, not repo-verified): an EPUB is a zip container; the `mimetype` entry is first and STORED (`application/epub+zip`); the package's OPF document is located through `META-INF/container.xml` → `rootfile`; metadata are `dc:title` / `dc:creator` elements in the OPF; a cover is declared by `<meta name="cover" content="…">` referencing a manifest item | knowledge (design input) |
| M17 | The released resilience rule: a file whose metadata cannot be read still imports as a library item with the filename-title fallback and the glyph cover (the malformed-PDF path); typed errors appear when opening, never silently | released (importing-pdfs.md; FR-06/FR-08) |
| M18 | `Builder::register_uri_scheme_protocol` exists in the bundled Tauri 2.12.5 (`tauri-2.12.5/src/app.rs:2267`, `src/plugin.rs:636`); WebView2's behavior for custom schemes (async handlers, CORS) is a **probe item** before design approval, not an assumption | verified (existence); probe pending (behavior) |
| M19 | pdfium reads PDF only — no EPUB capability | knowledge (design input) |
| M20 | Every app window is a WebView2/Chromium webview — a full HTML/CSS layout engine is already present in the product (the reader windows themselves are webviews) | released architecture |

### 3.2 EPUB metadata module — `src-tauri/src/epubmeta/`

- The library import pipeline branches on the lowercased extension: `.pdf` → `pdfmeta` (untouched); `.epub` → `epubmeta::extract(path) -> Result<EpubMeta, AppError>` with `EpubMeta { title: Option<String>, author: Option<String>, cover: Option<CoverImage> }`.
- Read order: open the zip → validate the `mimetype` entry → parse `META-INF/container.xml` (rootfile path) → parse the OPF: first `dc:title` → title, first `dc:creator` → author (name-order variants taken as-is, like the released author rule), `meta name="cover"` → manifest id → item href → cover bytes.
- **Malformed EPUB** (unreadable zip, missing container, missing/unparseable OPF): the released rule M17 applies unchanged — the document imports with the filename-title fallback and the glyph cover; the typed error surfaces only if the app is asked to do something the file cannot support. No silent failure, no import abort.
- **No schema change**: the document's type is its extension (`documents.filename` carries it). FR-21's rename must therefore state an extension-preservation rule — raised in the v0.0.8 review (this draft depends on it; AC-124 tests it). No `doc_type` column — a derived fact stays derived (R2.1 minimalism). No new whitelisted commands for the library half: import, metadata, and cover all happen inside the existing import pipeline (R1.1); the frontend changes for FR-22/UI-46 are filters and labels. The reading half's content delivery is OQ-58 (§3.10) — a custom protocol or reader commands, decided with OQ-57.
- Dependency: the crates chosen by **OQ-53** (§5) — the chosen option is the AGENTS §2 approval and lands in the Decision Log before the code (DR-260 records the question).

### 3.3 Covers (FR-22, existing pipeline)

- A declared cover item whose media type is raster (JPEG/PNG as declared in the OPF manifest): decode with the existing `image` crate, composite onto the released cover canvas with **contain-fit** — the image is scaled to fit the A4-ratio frame with its aspect preserved, letterboxed on the `surface-0` ground; **never cropped** (an EPUB cover is arbitrary-shaped; cropping silently loses text on jacket covers). Then the released pipeline unchanged: 640 px output, the DR-113 cache key (path + mtime + width).
- No declared cover, an SVG/non-decodable cover this release, or a malformed EPUB: the released glyph fallback.
- Cover regeneration on relink/rename follows the released rules (cache key changes with the path/mtime).

### 3.4 Import acceptance (UI-46)

- One shared constant replaces the two filter copies (M10): `DOCUMENT_FILTERS = [{ name: "Documents", extensions: ["pdf", "epub"] }]` in `ui/src/lib/` (importFlow's module), used by the import picker **and** the relink dialog; the folder walk in `service.rs` accepts both extensions; the drop filter in `App.svelte` accepts both.
- The typed rejection for unsupported extensions keeps its behavior; its kind name `not_pdf` predates two types and is **renamed `unsupported_type`** across service, client, and tests (mechanical rename, honest naming; recorded here per R9.1 — no behavior change beyond the message text naming both supported types).
- **Relink is type-matched**: the dialog filters to the extension of the document being relinked, and a mismatched selection is refused with the typed error (a missing EPUB is relinked to an `.epub`).

### 3.5 Opening and activation (FR-17 MODIFIED, OQ-54)

- The open flow branches on extension before any reader work: `.pdf` → the released reader-window path (FR-17 unchanged); `.epub` → the FR-23 reader path [OQ-54 A] or the existing external-open command (M13) [OQ-54 B]. No PDF reader window is ever created for an EPUB and no EPUB reader window for a PDF; the Reading-collection semantics (v0.0.8 FR-19: manual-only membership) are untouched.
- OQ-54 A: double-click and `Enter` on an EPUB open the app's own EPUB reader — activation behaves identically for every library member; the OS-application open stays a context-menu / row action (it exists either way). OQ-54 B: activation opens the OS application; the in-app reader opens only from the menu.

### 3.6 Type visibility (UI-47, OQ-56) — recommendation A: nothing

The library treats documents uniformly everywhere (search, tags, bulk, rename, relink, details — all extension-agnostic by construction). A badge or filter would add a visual concept for a distinction the user already sees in the filename. Options B/C are recorded in OQ-56; neither needs data or schema support, so adding one later is a pure-UI decision in a later release.

### 3.7 Labels (UI-44 MODIFIED, OQ-55)

The v0.0.8 draft explicitly deferred this revisit to "the release that introduces a non-PDF type" — this is that release. Option A ("Import files") restores the general wording the app shipped before DR-211 and stays true for every future type; option B enumerates both types in every control (long strings, ages badly, i18n cost across locales). The chosen wording lands in the same complete set of controls UI-44 enumerated; the empty-state hint (UI-40) names both types.

### 3.8 Fixtures and test corpus (R6)

`scripts/make-fixtures.mjs` gains EPUB generation (it already builds the PDF corpus): a valid EPUB with title/author/cover (a real raster cover image), a valid EPUB with no metadata, a valid EPUB with a declared cover that is SVG, a valid EPUB without a cover, and a malformed EPUB (not a zip). The fixture manifest and `src-tauri/src/testutil.rs` gain the new names; the `copy_fixture` mechanism is unchanged.

### 3.9 In-app EPUB reading — the technical options (OQ-57)

The problem, precisely: an EPUB is reflowable HTML/CSS in a zip. The PDF reader works because pdfium is a native layout engine — Rust lays out each page, renders a PNG, the frontend displays images (the released FR-17 design). No such engine exists in our stack for EPUB (pdfium reads PDF only, M19). But the product already carries a full HTML/CSS layout engine in every window: WebView2/Chromium (M20). The options differ on **who lays out the book** — the bundled web engine, with Rust serving it content, or Rust itself.

**Option A — app-owned reader: Rust parses and serves, the web engine displays, continuous flow, app typography.** *(the agent's recommendation)*
How it works: `epubmeta` (§3.2, already needed for import) gains the reading facts — spine order, manifest, chapter resources; the reader window (the released one-window-per-document pattern) renders sanitized chapter XHTML in the app's own reading typography (font family/size/line width/spacing chosen by the design system); a TOC panel from the spine (the released UI-33 control pattern); progress = book position (spine position + scroll fraction); navigation = continuous flow through the spine.
- *Pros:* no new frontend dependency; **one parser** — the same Rust code reads the package for import, covers, and reading (R1.1 intact: all product logic in Rust; the web engine only *displays* HTML, the same category as every other surface of this UI); typography and themes fully under app control — a dark reading mode that matches the design system; text selection and copy come free (the roadmap's reader-completion item arrives for EPUB at no extra cost); a simple, stable progress model (no CFI machinery); robust by construction — author scripts disabled, author CSS restricted to a safe subset.
- *Cons:* no paginated page-turn mode in this release — continuous flow only (a named scope limit; the PDF reader also ships a continuous mode); the reading surface is our own code (bounded effort: the window pattern and the TOC control pattern already exist); author-CSS edge cases are ours to normalize (embedded fonts work through the protocol; fixed-width layouts get width-normalized).

**Option B — epub.js in the reader window: Rust serves the package, a mature frontend library renders it.**
- *Pros:* the book-like experience arrives built-in: paginated page turns and spreads, reflow done by a mature engine, TOC and CFI-based progress; the Rust side is only the content server; the fastest path to a complete reading experience.
- *Cons:* a new **frontend** dependency (package.json — AGENTS §2 approval; `epub.js` is effectively single-maintainer); **a second parser** — epub.js parses the package itself, duplicating the Rust parser import and covers still need (two implementations of EPUB semantics, two failure modes — tension with R1.4); an **explicit R1.1 exception** — parsing and pagination are product logic living in JavaScript (a Rule-7 decision); theming fights author CSS (dark reading mode possible but fiddly); text selection across its paginated iframes is inconsistent.

**Option C — Rust layout engine: EPUB laid out in Rust, pages rendered to images, the PDF reader pipeline reused.**
- *Pros:* architecturally identical to FR-17 — R1.1 pure; the released view modes and zoom model apply; no frontend dependency.
- *Cons:* implementing HTML/CSS layout in Rust (block and inline flow, floats, tables, images, `@font-face`, the author-CSS subset real books use) is a months-long engine project with an unbounded defect surface; rendering quality on real-world EPUBs is doubtful at first-release scope; no text selection. The purity is real; so is the cost.
- *(Variant D — Rust converts EPUB to PDF and reuses pdfium — rejected with C: it needs the same layout engine, and fixed pages lose reflow, which is the point of EPUB.)*

**Reading-model consequence of the choice.** A ships continuous reading with app typography and free text selection; B ships page turns under third-party constraints; C ships page images without selection. These are different reading products, not implementation flavors — OQ-57 is the release's central decision.

### 3.10 Content delivery (OQ-58 — applies to options A and B)

- **A. Custom URI-scheme protocol (recommended).** `Builder::register_uri_scheme_protocol` exists in the bundled Tauri 2.12.5 (verified, M18): a Rust handler serves zip entries on demand as `pdfkeeper-epub://<document-id>/<package-path>` — the web engine gets ordinary URLs for chapters, images, CSS, embedded fonts; no IPC payload bloat; nothing extracted to disk (the reference-in-place principle holds). Probe before design approval: WebView2's handling of custom schemes (async handlers, CORS) — a verification step, not an assumption.
- B. Commands returning resource bytes: works with today's command plumbing; base64 images through IPC are heavy; acceptable for text, poor for assets.
- C. Temporary extraction to a cache directory: the simplest URLs, but it breaks reference-in-place and adds a cache lifecycle. Weaker.

### 3.11 Out of scope (recorded, not built)

- Full-text search; EPUB encryption and DRM (a DRM-encumbered EPUB opens with the OS application — the app does not license a DRM engine); page numbers/pagination facts.
- If OQ-57 A is chosen: paginated page-turn mode and facing spreads — deferred, not foreclosed (a later release may add them, possibly by adopting option B's library then); EPUB-specific view modes defer with them.

---

## 4. Acceptance criteria (index)

| AC | Layer | Test |
|---|---|---|
| AC-121 | FR-22, Rust | Import an EPUB fixture carrying OPF metadata → the record's title and author are the package's `dc:title` / `dc:creator` values |
| AC-122 | FR-22, Rust | Import an EPUB fixture with no metadata → the title follows the filename rule (the released fallback) |
| AC-123 | FR-22, Rust | A malformed EPUB imports as a library item (no import failure, no silent open); opening it surfaces the typed error path |
| AC-124 | FR-22, Rust + UI | Library capabilities on an EPUB document: tag add/remove, favorite, Reading toggle, search by title/author, rename (extension preserved), relink, missing detection, bulk operations — unit-level on the real pipeline + the UI flows |
| AC-125 | FR-17 (MODIFIED), OQ-54 | Activating an EPUB (double-click / `Enter` per the chosen option) opens the chosen surface — the in-app EPUB reader (A) or the OS application (B) — and **never** a PDF reader window; PDF activation is unchanged |
| AC-126 | UI-46 | Picker, folder import, and drop accept `.pdf` and `.epub`; any other extension is rejected with the typed message naming both supported types |
| AC-127 | FR-22, Rust | A declared raster cover produces a real cover through the released pipeline (contain-fit, no crop, 640 px, DR-113 cache key); a missing or undecodable cover produces the glyph fallback |
| AC-128 | UI-46 | Relinking a missing EPUB accepts an `.epub` file and refuses a PDF with the typed error (and the reverse for a PDF document) |
| AC-129 | UI-47, OQ-56 | Type visibility behaves per the chosen option (A: rows/cards carry no format marker and the extension is visible in the filename) |
| AC-130 | UI-44 (MODIFIED), OQ-55 | Every import control reads the chosen wording, uniformly; the empty-state hint names both types |
| AC-131 | NFR-01 guard | A mixed PDF+EPUB corpus imports within the existing import budget (the 10 000-document runner extended with EPUB documents) |
| AC-132 | FR-23, OQ-57 | An EPUB fixture opens in the app's own reader window (one window per document); the whole book is reachable end to end — first spine item to last — through the TOC control and flow navigation [details per the chosen option] |
| AC-133 | FR-23 | A malformed or unrenderable EPUB never opens silently: the typed error path, with the OS-application open offered; a missing file follows the released missing-document rules |
| AC-134 | FR-23 | Opening an EPUB with the OS application remains available as an explicit action alongside the in-app reader |
| AC-135 | UI-48 | The reading controls per the chosen option work within the released reader-interaction budget pattern (NFR-09): text size, TOC, progress readout as book position |
| AC-136 | OQ-58 | Content delivery per the chosen option: the chapters, images, CSS and embedded fonts of an EPUB fixture all render through it; no package content is copied to disk outside the chosen mechanism |

---

## 5. Open questions

| ID | Question | Status |
|---|---|---|
| OQ-52 | The FR reservation moves for the fifth time: `FR-22` + `FR-23` to EPUB (library + reader)? | **OPEN** |
| OQ-53 | EPUB parsing dependency (a new-dependency approval per AGENTS §2) | **OPEN** |
| OQ-54 | Activation behavior for an EPUB document (in-app reader vs OS application) | **OPEN** |
| OQ-55 | Import-label wording now that two types exist | **OPEN** |
| OQ-56 | Type visibility in the library UI | **OPEN** |
| OQ-57 | **The EPUB reading approach** — who lays out the book (§3.9) | **OPEN** |
| OQ-58 | Content delivery for the reading half (§3.10) | **OPEN** |
| OQ-59 | **App naming** — does the app rename once EPUBs are managed? (raised by the user 2026-11-10) | **OPEN** |

**OQ-52 — the fifth move of the app-updates reservation (extended by the user's scope decision DR-262).**
- **A. EPUB consumes `FR-22` (library support) and `FR-23` (in-app reader); the reservation moves again to `FR-24`+.** *Recommended — two independently testable capabilities, matching how the released app separates the library (FR-08…FR-16) from the reader (FR-17); the reservation has moved on every capability release so far (DR-104, DR-138, DR-182).*
- B. One `FR-22` covering EPUB end-to-end — saves an ID but bundles two capabilities with different designs, tests, and lifecycles into one requirement.
- C. Hold `FR-22` for app updates and give EPUB `FR-23`+ — burns a capability ID to protect a reservation that has never been consumed.
- D. Defer ID consumption until v0.0.8 ships — not workable: a complete draft needs its IDs.

**OQ-53 — EPUB parsing dependency (the answer is the dependency approval).**
- **A. `zip` + `quick-xml` (two small crates).** *Recommended — `zip` reads the container (mimetype, cover bytes) and `quick-xml` parses container.xml/OPF with full control over the few fields needed; both are widely used and small; nothing about EPUB semantics is hidden from us. Cost: two new crates.*
- B. The `epub` crate (one purpose-built crate). Fewer crates; it wraps exactly the container/OPF reading we would write ourselves, with less control over malformed-package resilience (M17 matters: our rule is "import anyway"), and a thinner maintenance record.
- C. `zip` only, hand-written OPF scanning. One new crate; the hand-rolled XML is fragile against namespace/prefix variants real-world EPUBs carry — a defect generator.
(Whichever option is chosen, the crates enter `Cargo.toml` only after this decision is recorded in the Decision Log — AGENTS §2.)

**OQ-54 — activation behavior for an EPUB (reframed by DR-262: an in-app reader is now in scope).**
- **A. Double-click / `Enter` opens the app's own EPUB reader (FR-23).** *Recommended — activation behaves the same for every library member, as it already does for PDFs; the OS-application open stays a context-menu / row action, exactly as FR-17 keeps it for PDFs.*
- B. Activation opens the OS default application; the in-app reader opens only from the menu. Defensible (EPUBs stay "external books") but it splits activation semantics across document types.
(The earlier option "activation does nothing" is withdrawn — it existed only because no in-app reader was planned.)

**OQ-55 — import-label wording.**
- **A. "Import files"** (the general wording, as before DR-211). *Recommended — true for every type the library will ever manage; short; the i18n keys are already named `toolbar.importFiles` etc. (UI-44 changes their values, never their key names), so option A is a values-only revert.*
- B. "Import PDFs & EPUBs". Explicit, but long in narrow toolbar buttons and every menu, and it becomes false the day a third type arrives.
- C. Keep "Import PDFs". False the moment EPUBs import — not offered as a real option.

**OQ-56 — type visibility in the library UI.**
- **A. Nothing: rows, cards, and menus stay type-agnostic; the extension in the filename is the type indicator.** *Recommended — no new visual concept; every capability already treats both types identically; the distinction is visible where filenames are.*
- B. A small format glyph on rows/cards. Makes mixed libraries readable at a glance; costs visual weight on every row and a grid-card treatment decision.
- C. A format filter in the Browse menu. Useful only in mixed libraries; adds a concept that interacts with Browse modes and saved filters.
A is chosen for this release under the Rule-7 recommendation; B or C remain openable in a later release with no data or schema support needed.

**OQ-57 — the EPUB reading approach: who lays out the book (§3.9).**
- **A. App-owned reader — Rust parses and serves, the web engine displays: continuous flow, app typography.** *Recommended — no new frontend dependency; one parser shared by import, covers, and reading (R1.1 intact); typography and dark reading mode fully under design-system control; text selection and copy come free; progress is a simple stable book position. Cost: no paginated page-turn mode in this release; the reading surface is our own bounded code.*
- B. epub.js in the reader window — paginated page turns and spreads arrive built-in, the fastest path to a book-like experience. Cost: a new frontend dependency (effectively single-maintainer library), a second parser duplicating ours, an explicit R1.1 exception (Rule 7), theming friction with author CSS, inconsistent text selection across its paginated iframes.
- C. A Rust layout engine rendering page images — R1.1 pure, the PDF reader pipeline reused. Cost: months of HTML/CSS layout-engine work with an unbounded defect surface; no text selection. The variant "convert EPUB to PDF and reuse pdfium" is rejected with C (same layout problem; fixed pages lose reflow).
The options are different reading products, not implementation flavors — this is the release's central decision. If page turns matter in the first release, B is the honest answer; A defers them without foreclosing them.

**OQ-58 — content delivery for the reading half (applies to options A and B).**
- **A. Custom URI-scheme protocol `pdfkeeper-epub://`** (§3.10). *Recommended — the registration API is verified present in the bundled Tauri 2.12.5 (M18); ordinary URLs for chapters, images, CSS, embedded fonts; no IPC bloat; nothing copied to disk. WebView2's custom-scheme behavior (async handlers, CORS) is a probe step before design approval, not an assumption.*
- B. Commands returning resource bytes: works with today's plumbing; heavy for images.
- C. Temporary extraction to a cache directory: the simplest URLs, but it breaks reference-in-place and adds a cache lifecycle.

**OQ-59 — app naming: does the app rename now that EPUBs are managed? (the user's question of 2026-11-10).**
Rename cost, measured 2026-11-10: `src-tauri/tauri.conf.json` carries `productName: "PDF Keeper"`, the window title, and `identifier: com.pdfkeeper.app` — the identifier is the data directory (`%APPDATA%/com.pdfkeeper.app/` holds `library.db`), so an identifier rename needs a data-directory migration, while a display-name-only rename keeps it (the standard escape hatch); the name also appears in the UI strings (`ui/src/lib/i18n/en.ts` About/menu entries), the icons, and 30 files / 60 occurrences across `docs/`, `AGENTS.md` and `README.md`. A half-finished rename is worse than either complete option.
- **A. Keep "PDF Keeper" through the 0.x line; revisit when the user declares 1.0.0 (or when the managed content genuinely shifts).** *Recommended — the name stays honest for the dominant format; "ebook-keeper" would misname the PDF-majority library and overclaim the ebook format family (MOBI/AZW3/FB2/DJVU are out of scope); at 0.x there is no distribution pressure; identity re-declaration belongs to 1.0.0, which is the user's act.*
- B. Rename to **"ebook-keeper"** in v0.0.9. Fits the reader story; describes a format family the app does not manage and names the majority of the library as something its owners do not call it; needs renaming again at the next type. Not recommended.
- C. Rename in v0.0.9 to a **format-neutral name** (the user's choice of name). The only rename that never needs renaming. Cost inside the largest release so far: display name + window title + UI strings + icons + the 30-file doc sweep + the identifier/migration decision (keep `com.pdfkeeper.app` or migrate).
- D. Defer the rename to its own small release (or fold it into 1.0.0), with the same neutral-name and identifier decisions made calmly. Defensible alternative to A if the rebrand intent is real.
If B or C is chosen, the affected UI-44/UI-46 wording and the acceptance criteria are added at closure (the rename touches the same control set as the label rows). If A or D is chosen, this spec is unchanged and the question leaves the release.

---

## 6. Decision Log (append-only)

- **2026-11-10 — DR-258: the draft is opened in advance at the user's request.** The user asked for a detailed draft spec for v0.0.9 (EPUB support) while v0.0.8 is still in review. The version name is carried from the user's request (workflow 1: versions are set by the user). The draft follows the roadmap's line 2 (EPUB Phase 1: library first; the in-app reader stays a later release) and states its baseline dependency: it builds on `SPEC-v0.0.8.md` **as drafted** (tags vocabulary, Reading, rename, open-folder, import labels); if v0.0.8 changes during review this draft is reconciled before its approval. The registry row is created in the same change (AGENTS Rule 1); the AGENTS §2 stage bullet is updated to describe both drafts (Rule 8, recorded here); the roadmap line 2 gains the drafted-spec note.
- **2026-11-10 — DR-259: investigation recorded.** Facts M10–M17 (§3.1): the PDF-only picker filters and their duplicated copy in the relink dialog; the `*.pdf`-only folder walk; the drop filter; the opener-plugin external-open path needing no backend change for EPUB; the absence of zip/XML crates; the fixture generator; the EPUB container/OPF format facts (knowledge input); the released malformed-file resilience rule the EPUB path reuses. Design consequences §3.2–§3.9: an `epubmeta` module beside `pdfmeta`; no schema change (the type is the extension); contain-fit cover compositing, never crop; the `not_pdf` → `unsupported_type` typed-error rename (R9.1); type-matched relink; OS-application activation; fixtures extended in `scripts/make-fixtures.mjs`.
- **2026-11-10 — DR-260: OQ-52…OQ-56 opened** with the options and the agent's recommendations (§5), including the new-dependency question the AGENTS §2 rule requires before any crate enters `Cargo.toml`. The approval gate is untouched: no code until every OQ is CLOSED, the registry status is APPROVED, and the user says "implement" — and v0.0.8's own approval/build order comes first.
- **2026-11-10 — DR-261: the roadmap's app-updates row (line 4) is updated** to state the reservation's current seat (`FR-22`+, per v0.0.8 OQ-46 closed A) and the fourth move this spec's OQ-52 proposes (`FR-23`+) — so no document implies two different seats for the same reservation.
- **2026-11-10 — DR-262: the user's scope decision extends the release to in-app EPUB reading.** "spec v0.0.9 should include in app epub reading" — the roadmap's Phase 1/Phase 2 split is merged into this release (roadmap line 2 updated). The draft is reworked: §0 scope and out-of-scope rewritten; `FR-23` (in-app EPUB reader) and `UI-48` (the reading surface) added; the option analysis recorded as §3.9 (app-owned reader / epub.js / Rust layout engine; the EPUB→PDF variant rejected) with the delivery sub-question §3.10 (custom protocol / IPC bytes / temporary extraction); `AC-132`–`AC-136` added; OQ-52 extended (two IDs, reservation to `FR-24`+ — supersedes the `FR-23`+ seat stated in DR-261's parenthetical), OQ-54 reframed (in-app reader vs OS application), **OQ-57 (the reading approach) and OQ-58 (content delivery) opened** with the agent's recommendation (app-owned reader + custom protocol; the alternatives' costs stated in full). New facts: M18 (`register_uri_scheme_protocol` verified present in tauri-2.12.5; WebView2 behavior is a probe item), M19 (pdfium is PDF-only), M20 (every window already carries a full HTML/CSS engine — WebView2).
- **2026-11-10 — DR-263: the user raised app naming ("should we rename the app to ebook-keeper in v0.0.9?") — recorded as OQ-59** with the rename cost measured (tauri.conf productName/title/identifier — the identifier is the data directory holding `library.db`; UI strings; icons; 30 files / 60 occurrences across docs). The agent's recommendation: keep "PDF Keeper" through 0.x (option A) — "ebook-keeper" misnames the PDF-majority library and overclaims the ebook format family; if the rebrand intent is real, decide it once, neutrally, as its own release or at the 1.0.0 declaration (options C/D).
- **2026-11-10 — DR-264: correction — the reservation move OQ-52 proposes is the fifth, not the fourth.** The fourth was v0.0.8's closed OQ-46 (re-reservation to `FR-22`+); v0.0.7's move to `FR-19`+ was the third. The §0 ID policy and the OQ-52 header carry the corrected ordinal; DR-261's and the draft history's wording are superseded by this entry, not edited (append-only). Found while reviewing `SPEC-v0.0.8.md` for the user; the same review corrected this draft's baseline cross-references (v0.0.8 IDs), the UI-44 old-text quote (now verbatim v0.0.8 text), the OQ-55 option-A parenthetical (UI-44 changes i18n values, never key names), and §3.2's rename-extension reference — recorded here per Rule 8; the v0.0.8 findings themselves are raised to the user in the review report, not silently applied to that draft.
- **2026-11-10 — DR-284: one-time correction of the test counts in the frozen `SPEC-v0.0.8.md` DR-283 entry (the user's option A).** The Ship entry drafted the inventory summary as "Rust 119 unit + 1 ignored, UI unit 217, flows 48 — 36 main + 12 reader". The post-Ship Phase C run measured the tree: **Rust 82 `#[test]` (82 passed, 0 ignored), frontend units 124 `it()` call sites in 17 files (210 Vitest run-time cases including the parameterized token checks), 56 harness flows (494 check call sites, 4 `skip()` sites, 5 `timingRow()` sites)**. The frozen entry's two count parentheticals are corrected to these verified numbers; nothing else in the v0.0.8 spec is touched. This is the third one-time exception to the frozen-spec rule after DR-71 and DR-76, made with the user's explicit approval for that operation and recorded here because this is the current spec (Rule 8). The same Phase C run corrected three stale inventory rows (two pre-rename test names, the four missing `AC-119` anchor-handoff rows) and recorded its findings as `D26`–`D28` in the ROADMAP §4 ledger — the first application of the formalized DR-252 sequence working as designed: the deterministic card-pill defect (D27) is a v0.0.7 carry-over its waived Phase C could not reach.

---

## 7. Draft history

- **2026-11-10** — Draft opened in advance at the user's request (DR-258). Investigation recorded (DR-259). OQ-52…OQ-56 opened with recommendations (DR-260). Status **PROPOSED**; the registry row is created in the same change. This draft is reviewable only alongside v0.0.8: its baseline is that draft as written.
- **2026-11-10** — The user's scope decision (DR-262): **in-app EPUB reading joins the release**. The draft is reworked to EPUB end-to-end: FR-23 + UI-48 added, the technical option analysis recorded (§3.9/§3.10), AC-132…AC-136 added, OQ-52 extended and OQ-54 reframed, **OQ-57 (the reading approach) and OQ-58 (content delivery) opened**. OQ-52…OQ-58 now decide the release; the approval gate is unchanged.
- **2026-11-10** — The user raised app naming (rename to "ebook-keeper"?). Recorded as **OQ-59** with the rename cost measured (DR-263); the agent recommends keeping "PDF Keeper" through 0.x (option A; rename options B/C/D recorded). Open questions: OQ-52…OQ-59.
- **2026-11-10** — Cross-check against the actual v0.0.8 draft (the review the user requested) corrected this draft: the reservation ordinal (fifth, not fourth — DR-264), the baseline line's v0.0.8 ID references, the UI-44 old-text quote (verbatim), the OQ-55 option-A parenthetical, and §3.2's extension-preservation dependency (raised as a v0.0.8 finding).
- **2026-11-10** — The v0.0.8 post-Ship Phase C ran (first application of the formalized DR-252 sequence): its findings entered the ROADMAP ledger as `D26`–`D28` — the next release's repair scope includes them — and the user approved the one-time correction of the frozen DR-283 test counts, recorded as DR-284. This draft's baseline reconciliation (v0.0.8 shipped with Phase-B additions) remains due before approval.

---

## 8. Build ledger

One row per requirement and acceptance criterion of this release (AGENTS workflow 3). All rows start ⬜. Stages follow the order in workflow 3. The ledger is maintained as a factual record while building.

| ID | Stage | Status | Commit | Test |
|---|---|---|---|---|
| FR-22 | Rust core → commands → UI | ⬜ | - | - |
| UI-46 | Rust core → UI | ⬜ | - | - |
| UI-47 | UI | ⬜ | - | - |
| FR-23 | Rust core → commands → UI | ⬜ | - | - |
| UI-48 | UI | ⬜ | - | - |
| FR-17 (MODIFIED) | UI | ⬜ | - | - |
| UI-44 (MODIFIED) | UI | ⬜ | - | - |
| AC-121...AC-131 | per §4 | ⬜ | - | - |
| AC-132...AC-136 | per §4 | ⬜ | - | - |
