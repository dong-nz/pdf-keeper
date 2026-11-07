# SPEC-ALL-TESTS.md — Test Inventory (all layers)

**Living document, not a release spec.** It has no lifecycle status and is not a requirements source: requirements and acceptance criteria stay in the release specs (this file never restates them as definitions). It is the factual inventory of every test case the repository implements *today*, per `docs/specs/INDEX.md` → current spec → `AGENTS.md` §2a maintenance rules (DR-160).

Generated 2026-11-07 by extracting the sources directly: `#[test]` items under `src-tauri/src/`, `it()`/`test()` items under `ui/src/`, and every `check()`/`skip()` call site in `scripts/ui-smoke.mjs` and `scripts/ui-10k.mjs`. Counts below are call sites in the current working tree; parameterized checks (width matrix, contrast matrix) run once per case, and a lane run additionally asserts its own suite-level checks — core lanes four (AC-49 source scan, AC-56 sleep scan, AC-58 wall time, AC-60 area coverage), docs lanes their own budget check — so a full run asserts more than the number of listed call sites (the per-lane pattern is exact: each lane reports its flow's call sites plus those suite-level checks, the width matrix doubling at its two tested widths) — verified against the tree by the full-mode run of 2026-11-07 (`node scripts/ui-verify.mjs`, exit 0): 44/44 lanes green, 474/474 check executions, combined wall time 130.7 s — inside the NFR-06 300 s budget.

|Layer|Runner|Test call sites|
|---|---|---|
|Rust core|`cargo test` (in `src-tauri/`)|63 `#[test]` in 9 files|
|Frontend units|`pnpm -C ui test` (Vitest)|76 tests in 13 files|
|UI smoke harness|`node scripts/ui-smoke.mjs`|41 flows, 289 check call sites (a direct full run asserts exactly 289 — no direct run shape duplicates checks any more; under `scripts/ui-verify.mjs` full mode each core lane additionally asserts its own suite-level checks, which is why the 44-lane run reports more executions — see §3); the file additionally holds the bodies of the three exported scale flows (15 call sites), executed only by the 10k suite and its lanes|
|10 000-document suite|`node scripts/ui-10k.mjs`|4 flows + 1 suite-level budget check = 26 check call sites (a full run asserts 29: the width matrix runs its four checks per tested window width, plus the shared 3-check prefix)|
|Full-verification orchestrator|`node scripts/ui-verify.mjs`|1 scheduler gate (every lane green + combined wall ≤ 300 s) — implemented as its own exit gate, not a `check()` call site, so it is not in the counts above; §3|

The authoritative **requirement → test** mapping stays in each release spec (acceptance-criteria index + Build ledger). This document is the other direction: every test, and what it asserts. The `covers` columns list only requirement IDs the test source itself names; `—` means the test text carries no ID, not that none exists.

---

## 1. Rust unit tests — `cargo test`

Run: `cargo test` in `src-tauri/` (no UI, no network; per RULES R1.1 every product behavior is testable here). Clippy must stay clean (`cargo clippy -- -D warnings`).

### `src-tauri/src/db/mod.rs` — schema & migration (5)

|Test|Verifies|
|---|---|
|`fresh_database_migrates_to_current_version`|a new database lands on the current `user_version` schema|
|`migration_is_idempotent_and_keeps_data`|re-running migrations preserves rows (additive migration rule)|
|`foreign_keys_are_enforced`|the `PRAGMA foreign_keys` contract behind category assignment|
|`fts_triggers_keep_index_in_sync_with_every_mutation`|FTS5 index follows insert/update/delete|
|`settings_round_trip_and_overwrite`|settings table write/read/overwrite|

### `src-tauri/src/data_dir.rs` — data-directory resolution (3, DR-162)

|Test|Verifies|
|---|---|
|`data_dir_override_absolute_is_used`|an absolute `PDFKEEPER_DATA_DIR` replaces the app resolution (the parallel-suite mechanism)|
|`data_dir_without_override_keeps_the_app_resolution`|unset or empty means the released `app_data_dir()` resolution, unchanged|
|`data_dir_override_must_be_absolute`|a relative override is a typed validation error naming the variable and the rejected value|

### `src-tauri/src/lib.rs` — startup gate & command contract (4)

|Test|Verifies|covers|
|---|---|---|
|`ui_gate_releases_a_waiter_when_marked`|startup task publishes counts only after the first command proves the UI bridge|FR-15|
|`ui_gate_wait_returns_false_on_timeout`|the gate cannot hang a waiter forever|—|
|`only_command_calls_mark_the_ui_gate`|nothing but a real command invocation opens the gate|—|
|`command_router_matches_the_ui_command_client`|the invoke handler and `ui/src/api.ts` expose exactly the same command list (spec §5.3.3 — the whitelist cannot drift on either side)|—|

### `src-tauri/src/library/mod.rs` — import primitives (4)

|Test|Verifies|
|---|---|
|`normalize_path_is_absolute_and_lexically_clean`|stored paths are absolute, `.`/`..` resolved|
|`normalize_path_keeps_absolute_input_unchanged_apart_from_redundant_parts`|normalization never rewrites a clean absolute path|
|`pdf_detection_is_extension_based_and_case_insensitive`|`.pdf`/`.PDF` accepted, other extensions rejected|
|`fallback_title_strips_the_extension`|filename fallback title drops the extension|

### `src-tauri/src/library/query.rs` — search & ordering (14)

|Test|Verifies|covers|
|---|---|---|
|`compile_match_builds_quoted_prefix_tokens`|each token becomes a quoted FTS prefix term|—|
|`prefix_search_hits_all_four_fields`|title/author/filename/notes all match (FR-03 four-field search)|—|
|`filters_compose_with_and_semantics`|mode + filters combine as AND|—|
|`several_active_categories_select_the_union`|multi-category filter = union|—|
|`favorites_are_pinned_under_every_sort_key_and_direction`|favorites lead the list regardless of sort|—|
|`sort_whitelist_maps_known_keys_and_defaults_to_title_asc`|only whitelisted sort keys, default title A→Z|UI-04|
|`secondary_whitelist_maps_keys_and_treats_none_as_unset`|secondary-key whitelist; `none` clears it|FR-13|
|`order_clause_with_no_secondary_is_the_shipped_clause`|no secondary key ⇒ exactly the pre-v0.0.5 ORDER BY|—|
|`secondary_key_resolves_primary_ties_deterministically`|primary → secondary → id total order|—|
|`slices_partition_the_full_ordering_without_gaps_or_overlap`|paged slices reassemble the full ordered set|—|
|`malformed_fts_query_triggers_the_like_fallback`|user text that breaks FTS syntax falls back to LIKE|—|
|`like_fallback_escapes_wildcards_so_tokens_stay_literal`|`%`/`_` stay literal in the fallback|—|
|`ids_query_returns_the_full_matching_set_in_list_order`|the id query (Select-all-matching) matches the visible order|—|
|`category_names_travel_with_rows_for_badges`|rows carry their category names for the UI|—|

### `src-tauri/src/library/service.rs` — library operations (16)

|Test|Verifies|covers|
|---|---|---|
|`import_extracts_info_titles_and_falls_back_to_filename`|Info-dictionary title, filename fallback|FR-05|
|`import_skips_duplicates_and_auto_assigns_the_selected_category`|duplicate skip + assignment on import|FR-01|
|`import_of_ten_thousand_fixtures_stays_within_budget`|10 000-file import under the time budget|AC-01, NFR-02|
|`search_of_ten_thousand_documents_stays_within_budget`|search latency at 10 000 documents|AC-02, AC-01|
|`categories_membership_bulk_edit_and_delete_cascade`|create/assign/bulk-edit/delete with document detach|AC-03, FR-02|
|`delete_library_only_keeps_the_file_delete_with_file_removes_it_and_its_cover`|both delete modes, cover cleanup on file delete|AC-04, AC-62, FR-09, FR-11|
|`rescan_marks_missing_and_relink_restores_the_entry`|rescan flags missing, relink restores|AC-05|
|`rescan_restores_entries_when_files_come_back`|reappearing files clear the flag|—|
|`title_source_transitions_gate_relink_re_derivation`|a manual title survives relink; an auto title re-derives|—|
|`update_rejects_empty_title_at_the_service_boundary`|empty title never reaches the database|—|
|`every_mutation_emits_matching_status_counts`|status events after each mutation match the resulting counts|—|
|`import_progress_events_cover_the_whole_batch`|progress events span the whole import|—|
|`settings_carry_secondary_sort_and_grid_override`|secondary sort + manual column count persist|FR-13, UI-08|
|`theme_defaults_to_system_and_accepts_only_the_three_states`|theme setting values `system/light/dark` only|UI-17|
|`last_filter_grammar_accepts_the_new_form_and_the_legacy_one`|new `mode/categories` grammar and the v0.0.1 `cat:` form both load|—|
|`import_assigns_every_active_category`|import assigns to every active category|FR-10|

### `src-tauri/src/pdf/mod.rs` — reader engine (9)

|Test|Verifies|covers|
|---|---|---|
|`the_queue_takes_interactive_requests_ahead_of_cover_jobs`|reader render jobs outrank cover jobs in the pdfium queue|—|
|`reader_cache_paths_address_one_directory_per_document`|per-document cache directory layout|—|
|`reader_cache_cleanup_removes_the_document_directory_and_tolerates_absence`|close-time cleanup is complete and idempotent|AC-62, AC-67|
|`document_info_reports_the_fixture_page_count_and_sizes`|page count + page sizes from the document|AC-61|
|`page_rendering_honours_the_scale_bounds_and_page_range`|render scale clamped, requested range respected|AC-61, AC-62|
|`rendered_pages_are_distinguishable_by_the_drawn_page_number`|fixtures render distinct pixels per page|AC-61|
|`the_scale_fixture_serves_its_last_page_like_its_first`|the 1 000-page scale fixture reports 1 000 pages and its last page renders|AC-65|
|`serve_page_writes_the_cache_once_and_serves_the_cached_file_after`|cache written once, served on re-request|—|
|`the_reader_helpers_report_an_unopenable_document_as_a_typed_error`|non-PDF/corrupt file → typed `AppError`, not a panic|AC-69|

### `src-tauri/src/pdfmeta/mod.rs` — metadata extraction (2)

|Test|Verifies|covers|
|---|---|---|
|`info_dictionary_hit`|Title/Author/Subject/Keywords read from the Info dictionary|—|
|`encrypted_malformed_and_info_less_files_yield_nothing`|no metadata invented for unreadable files|FR-05|

### `src-tauri/src/covers/mod.rs` — cover pipeline (6)

|Test|Verifies|covers|
|---|---|---|
|`cache_key_changes_with_any_part_of_the_document_identity`|path/mtime/size each change the cache key|FR-16, AC-36|
|`enqueue_missing_covers_queues_only_documents_without_a_cache_file`|backfill skips covered documents|—|
|`sweep_orphans_removes_pngs_no_document_owns`|orphaned cache files deleted|—|
|`worker_renders_valid_pdfs_and_leaves_glyph_fallback_for_unrenderable`|real PNGs for valid files, fallback for broken ones|AC-06, AC-36|
|`cover_pool_size_clamps_the_override_and_bounds_the_default`|pool-size setting clamped to its allowed range|—|
|`worker_pool_renders_every_cover_exactly_once_across_two_workers`|parallel workers: no duplicate, no missed cover|AC-57|

---

## 2. Frontend unit tests — Vitest (`pnpm -C ui test`)

### `ui/src/lib/chip-cutover.test.ts` — 2 · *chip cutover (UI-24, AC-46)*
- finds frontend sources to check
- no stylesheet rule, component or token definition references the chip

### `ui/src/lib/debounce.test.ts` — 4 · *debounce*
- coalesces a burst into one trailing call with the last arguments
- each call restarts the window
- a gap longer than the delay starts a new burst
- cancel() drops a pending call

### `ui/src/lib/design-tokens.test.ts` — 3 parameterized · *${rampName}: text-role contrast (AC-43/AC-71)* · *dark ramp: §3.6 mapping as declared (AC-70)*
- ${pair.role} clears 4.5:1 — every text role on every surface it is used on, both ramps
- the declared token set is exactly the mapped one
- --${token} equals its mapped value

### `ui/src/lib/format.test.ts` — 4 · *format*
- formats counts with the locale's grouping
- formats sizes as short byte units
- formats dates with the medium date style
- selects plural categories through Intl.PluralRules

### `ui/src/lib/i18n/coverage.test.ts` — 5 · *i18n coverage*
- finds message call sites to check
- every t() key exists in the catalog
- every tp() base carries both plural variants
- no catalog key is orphaned
- no label ends with an ellipsis except the progress group (UI-20, AC-40)

### `ui/src/lib/i18n/plural-count.test.ts` — 2 · *tp count formatting (R8.1)*
- groups multi-thousand counts like the rest of the product
- keeps single-item counts and plural selection intact

### `ui/src/lib/searchScope.test.ts` — 7 · *search placeholder (UI-16)*
- names the whole library when no filter is active
- names the one active category
- counts several active categories
- names Favorites, and the combination with categories
- names Missing
- ignores a category id that no longer exists
- the query text never changes the scope

### `ui/src/lib/skeleton-geometry.test.ts` — 3 · *skeleton geometry source rule (UI-28, AC-50)*
- imports the row geometry constants from virtual.ts
- sizes the cover placeholder from the constants, not from its own numbers
- the cover's own CSS rule defines no dimensions

### `ui/src/lib/state/feedback.test.ts` — 2 · *feedback overlay stack*
- keeps a closed overlay counted until the current task ends
- plain open/close without a race still balances the count

### `ui/src/lib/state/import-discipline.test.ts` — 2 · *store import discipline (R7.5)*
- finds store imports to check
- every store import uses the canonical $lib/state/… spelling

### `ui/src/lib/state/reader.test.ts` — 22 · *page geometry (exact, never measured)* · *navigation* · *zoom walk (UI-30)* · *image request width* · *page serving through the store* · *the scroll position is a single source (DR-155)*
- fit-width renders every page at the content width and its own aspect ratio
- every zoom step scales the width by exactly that percent (AC-66)
- resizing re-derives fit-width — the zoom is relative to it, not absolute
- the stack offsets carry the gap and the total height, and pages resolve at their tops
- jumps land one pixel inside the target page's stack offset
- targets outside the document clamp to its first and last page
- a page jump with no scroller attached does not fail
- − / + move through the fixed steps and clamp at the ends
- an unknown current value restarts from fit-width, never invents a step
- the store's changeZoom only ever produces listed steps
- requests device pixels at most 2× the CSS width
- stays inside the command's accepted range
- serves a mounted page once per width: scrolling does not re-request it
- a zoom change re-requests at the new width (NFR-08's re-show path)
- a target above the fast-render cap previews first and refines in place (DR-151)
- a request before the first fit-width measurement stays inside the command's range (DR-153)
- at devicePixelRatio above 1 the preview uses the CSS display width, not the cap (DR-153)
- a target at or below the fast-render cap is a single request (DR-151)
- a typed page failure becomes the window's error state (§3.2)
- currentPage follows the store's scrollTop through the exact offsets
- an unmeasured window claims page 1, the position the scroller is at (DR-154)
- goToPage and currentPage agree: the delivered target names the page it claims

### `ui/src/lib/state/settings.test.ts` — 3 · *settings store*
- stores every key a query change modifies
- coalesces a burst into one write per key, holding the last value
- keeps a view change and a column override written together

### `ui/src/lib/virtual.test.ts` — 17 · *window (uniform items)* · *row heights (DR-85, UI-03 metrics)* · *window (rows of different heights)* · *nearEnd* · *gridLayout (§5.3.5 as modified by DR-99, AC-31)*
- clamps the top of the list
- keeps the overscan band around the visible range in the middle
- clamps the end of the list and leaves no bottom padding
- partitions every scroll position without gaps or overlap
- bounds the mounted count at the largest viewport the app serves
- handles an empty list
- sizes a row by the metadata lines it renders
- prefix offsets give every row its top and the list its total
- mounts exactly the rows the viewport touches
- keeps the padding invariant at every scroll position
- clamps both ends
- triggers slice loading only near the loaded end
- measures the threshold from the last rows' real heights
- Auto derives the column count from the 232 px pitch and stretches the cards to the container
- a manual count wins and widens the cards instead of leaving slack (DR-83 + DR-99)
- AC-31: at 900, 1280 and 1900 px, for Auto and every manual 2–10 count, the card is the derived width capped at 320 and the row never exceeds the container
- the cover keeps the A4 ratio at every width; the 220 px card measures 379 px (D6 removed the cover padding)

---

## 3. UI smoke harness — `scripts/ui-smoke.mjs`

Drives the **real built app** (`src-tauri/target/debug/pdfkeeper.exe`) through tauri-driver (W3C WebDriver → msedgedriver); reader flows run on a second runtime — the same exe driven over CDP (DR-147). Prerequisites: `tauri-driver` + version-matched `msedgedriver` on PATH; fixtures generated by `scripts/make-fixtures.mjs` (D15: never committed binaries).

**Entry points.** The standard UI verification (stage 4, RULES R6) is full mode:

|Command|What it is|
|---|---|
|`node scripts/ui-verify.mjs`|**The verification entry point.** Runs every UI test case as its own lane in barrier-separated phases (§3 "Full verification" below); exit 0 only if all lanes pass within the 300 s combined budget. `--report [path]` also writes the final summary to a file (default `tmp/test-reports/`).|
|`node scripts/ui-verify.mjs --coarse`|Documented triage fallback: the two-suite split of DR-162 (core ∥ 10k), less isolation, slower wall.|
|`SMOKE_FLOW=flowX node scripts/ui-smoke.mjs`|One flow standalone against the app's own data directory — the deterministic reproduction harness for debugging a failure.|
|`SMOKE_SET=<area> node scripts/ui-smoke.mjs`|All flows of one feature area plus the mandatory prefix.|
|`node scripts/ui-10k.mjs`|The 10 000-document suite standalone (§4).|
|`SMOKE_10K_FLOW=<flow>[,<flow>…] node scripts/ui-10k.mjs`|One or more 10k flows standalone — the same selector the docs lanes use. Prefix runs first; a selection without `flowImport10k` pays the corpus as a quiet setup import instead of the measured test case (§4 Run modes).|

**Run shapes.** No arguments: full suite on the core tier (functional section, reader section last) — since DR-161 this suite never imports the docs tier: every 10 000-document UI test case runs in the separated 10k suite (§4). `SMOKE_SET=<area>[,<area>…]`: exactly the flows of the named feature areas, core tier. `SMOKE_FLOW=flowX,flowY`: narrows further (debugging aid; a scale-flow name errors with a pointer to `scripts/ui-10k.mjs`). Every flow is timed (D14/AC-54); wall time is checked against the NFR-06 budget; exit 0 only if every check passes. The bodies of the three scale flows live in `ui-smoke.mjs` (they share its geometry/menu/selection helpers) and are exported for the 10k suite; no ui-smoke run shape executes them.

**Full verification: `node scripts/ui-verify.mjs` (DR-162 lanes, DR-163 per-flow split, DR-164 phases, DR-165 isolation, DR-168 phase order).** The entry point that runs every UI test case as its own lane: 1 prefix lane (the two prefix test cases, checks ON, owns the build, runs alone first), 10 measured lanes run **one at a time** (the five reader lanes; the bounded-job lanes `flowStatusBar`, `flowProgressTransform`, `flowMissingAndRelink`; the picker-request lane `flowSearchField`; the window-strip double-click lane `flowDragRegion` — a measured claim is a statement about single-instance conditions), 1 corpus-import lane (runs alone — its AC-57/NFR-02 claims are measured while nothing else runs; it follows the measured phase so its cover-queue disk flush cannot bleed into the first reader lane — the flake mechanism DR-168 records), and 32 flood lanes (the remaining 29 functional and 3 scale lanes, cap 10, `SMOKE_VERIFY_LANES`; the measured-phase cap is `SMOKE_VERIFY_MEASURE_LANES`, default 1, clamped 1..8) — 44 lanes total. The groups are barrier-separated: each starts only after the previous group's last lane exits. Every lane runs against its own data directory (`%APPDATA%\com.pdfkeeper.app\parallel\lanes\<flow>`, via `PDFKEEPER_DATA_DIR`, the same variable the app's resolver reads), its own tauri-driver/WebDriver ports (4444+i / 17556+i; reader lanes also their own CDP debug port 9323+i and per-port WebView2 profile directory), and scoped cleanup that touches only its own process tree (the shared image name and shared WebView2 profile belong to all lanes). The combined clock runs from the build owner's session line to the last lane exit and is asserted against the same ≤ 300 s budget; exit 0 only if every lane passes within it. Global image-name sweeps run only before anything starts and after all lanes are done. `--coarse` selects the documented triage fallback: the two-suite split of DR-162 (this suite as the `core` lane at `…\parallel\core`, the 10k suite as the `docs` lane at `…\parallel\docs`; core owns the build, docs is released on its session line). Direct runs of either suite keep working unscoped (the app's own data directory, global cleanup); `SMOKE_FLOW`/`SMOKE_SET`/`SMOKE_10K_FLOW` select standalone runs. `--report [path]` (DR-167) additionally writes one final summary file — verdict, mode + caps, lanes ran, check tallies, combined wall vs the budget, the per-lane table, and the failed check names per failed lane (no per-check transcript); default `tmp/test-reports/verify-<UTC stamp>.md` (gitignored); a write failure is reported on stdout and never changes the exit code.

**Prefix rule (AC-60):** every named set starts with the mandatory prefix flows (the app-shell check and the drop-pipeline check the other flows reuse); the 10k suite runs the same prefix, selected or not. With `SMOKE_PREFIX_QUIET=1` — set for every lane of `ui-verify.mjs` — the prefix runs as setup: its passing checks log but are not recorded, a failed setup check is recorded as the lane's failure. The `AREAS` table below and the run sequences are maintained together; the suite itself enforces that every flow appears in at least one area.

### 3.1 Suite-level checks (run by the executed runner's `main()`, not inside a flow)

|Check|Asserts|covers|
|---|---|---|
|`checkTokenSource()`|no token added to `design-tokens.css` beyond the names this release's designs mandate (compared against the released baseline via git)|AC-49 (source half)|
|AC-56 source scan|no fixed `sleep()` longer than 250 ms in either harness file (scans `ui-smoke.mjs` **and** `ui-10k.mjs` — extended by DR-159, DR-161)|AC-56|
|AC-60 orphan scan|every flow in every sequence appears in at least one feature area|AC-60|
|wall-time budget|suite total ≤ 300 s across both runtimes|NFR-06, AC-58|
|scheduler gate (`ui-verify.mjs` full mode)|every lane exits green **and** the combined wall time from the build owner's session line to the last lane exit ≤ 300 s — the orchestrator's own exit gate (not a `check()` call site); `--coarse` asserts the same gate over its two lanes|NFR-06, AC-58|

### 3.2 Prefix flows (2)

**`flowStartup`** — area: getting-started
- startup: app shell + document area mount
- startup: empty-state variant for a fresh library

**`flowDropAndSkip`** — area: getting-started · covers FR-01, FR-11
- drag-drop: synthesized drop reaches the app pipeline end-to-end
- non-PDF import is reported as a skip, never silently ignored (FR-11)
- *conditional skip:* `drag-drop: synthesized tauri://drag-drop delivery` when the platform delivery cannot be synthesized (0 skips in all v0.0.6 runs)

### 3.3 Functional flows (34, core tier)

**`flowSearchDebounce`** — searching
- Ctrl+F focuses search (keyboard reachability)
- debounced search reaches the correct result set
- stale responses are never rendered (only the newest query is on screen)
- Esc clears the search and restores the full list

**`flowCategories`** — browsing-and-filtering, categories · covers UI-10, AC-03, UI-04, UI-09
- UI-10: Manage categories opens the categories manager
- AC-03 UI: category creation via keyboard (manager field + Enter) ×2
- Space + ArrowDown select rows and open the bulk bar
- bulk bar opens the category picker (UI-04)
- picker pre-ticks add for a category the selection lacks (UI-04)
- picker add checkbox toggles the assignment off and on
- AC-03 UI: a category filter from Browse shows exactly the assigned documents
- UI-09: the active category appears as a checked item

**`flowContextMenu`** — opening-and-deleting · covers UI-05, AC-68, UI-31
- right-click opens the context menu on screen (UI-05)
- Esc closes the context menu
- closing the menu with Esc leaves the selection intact (§5.2)
- AC-68: the context menu carries Open then Open in external viewer
- AC-68: the external item calls app_open_document exactly once and not the reader command
- AC-68: the in-app item calls app_open_reader_window and never app_open_document
- AC-68: the row action line is unchanged — no Open action appears on rows

**`flowDelete`** — opening-and-deleting · covers AC-04
- AC-04 UI: Delete key opens the confirmation dialog
- Esc cancels the dialog and keeps the selection (§5.2)
- the same selection re-opens the dialog after cancel
- AC-04 UI: 'Delete from library' removes exactly the selection
- library count reflects the deletion

**`flowFavorites`** — favorites · covers FR-04, UI-09
- favorites flow: a mid-list row is available
- FR-04: starring updates the favorites count
- FR-04: the starred row does not jump mid-scroll (agreed UI)
- FR-04: the Favorites view shows exactly the starred document
- UI-09: the Favorites mode appears as a checked item
- UI-09: clearing the filter in the Browse menu clears that filter and nothing else
- FR-04: the starred document is pinned to the top on the next query
- FR-04: unstarring removes the document from Favorites

**`flowMetadata`** — metadata-editing · covers FR-05, UI-02, FR-03, AC-52
- metadata flow: a row is available
- FR-05: the details modal opens from the row menu
- UI-02: an untouched auto title carries the provenance hint
- UI-02: the hint disappears on the first edit
- FR-05: saving updates the title on the row
- FR-05/FR-03: the edited title is found by search
- delete flow: the renamed row is findable by text
- UI-02: the editor hands the document to the delete flow (singular title)
- UI-02: cancelling the delete keeps both the document and the editor
- UI-02: deleting from the editor removes the document and closes the editor
- UI-02: Escape with unsaved changes opens the discard step and keeps the editor and the draft
- UI-02: 'Keep editing' closes the step and leaves the draft in place
- AC-52: Ctrl+A inside the title field selects the field's text and starts no library selection
- AC-52: the field selection behaves like an editor selection — typing replaces it
- UI-02: discarding closes the editor and the stored title is untouched

**`flowStatusBar`** — status-feedback · covers AC-56, AC-22, AC-53
- AC-22 / AC-53: the bounded rescan job shows a real progress bar in the bar
- AC-22: the bar is quiet again once a job ends
- AC-22: with nothing to say the status bar shows only the document count
- AC-22: while filtered the status bar shows the result count, and the document count stays library-wide

**`flowProgressTransform`** — status-feedback · covers AC-42, AC-49
- AC-42: the progress fill transitions transform with a real duration
- AC-42: the fill keeps width 100% of the bar — the progress rides the transform
- AC-49: the progress row gap is a multiple of 4 px

**`flowMissingAndRelink`** — missing-files-relinking · covers FR-15, AC-05, AC-47, UI-25, AC-37, AC-22, UI-02
- job progress completes; Rescan re-enables after the bounded job drains (FR-15)
- AC-05 UI: manual Rescan reports the missing file
- AC-05 UI: the row is flagged missing
- AC-47: the row flag is plain text in the corrected warning color — no ground, no pill
- AC-47: the row flag's tooltip carries the stored path
- AC-37: the missing document's actions line includes Relink in the same order as its context menu
- AC-37: a present document's actions line shows no Relink
- AC-47: the card overlay keeps a warning-tinted ground with radius at half its height
- AC-47: the card badge's tooltip carries the stored path
- AC-37: the missing document's card actions line includes Relink
- AC-22: with a missing file the status bar shows the warning
- failed command produces a toast with its action (Relink)
- AC-05 UI: the toast action opens the relink dialog
- Esc closes the innermost overlay
- UI-02: the editor's Relink opens the relink dialog
- AC-05 UI: Rescan finds the file again and clears the flag
- AC-22: the status bar stops saying it once nothing is missing

**`flowMetaColumn`** — importing-pdfs, metadata-editing · covers AC-45
- meta-column flow: the differently-named fixture imported
- AC-45: the meta column's left edge and the figures' right edge are uniform across rows
- AC-45: the meta column reserves the fixed 96 px box
- AC-45: the measured rows actually carry filenames of different lengths
- meta-column flow: the imported row is selected and the delete confirmation opened *(setup/cleanup)*
- meta-column flow: the imported document is gone again *(setup/cleanup)*

**`flowOpen`** — opening-and-deleting · covers AC-12, AC-64, AC-30, DR-66, UI-18, AC-67
- AC-12 / AC-30 / AC-64: a single click opens nothing and, in browse mode, selects nothing (DR-66, UI-18)
- AC-64: a real double-click activates the document (reader window)
- AC-64: the double-click handler activates the document
- AC-64: Enter still activates the focused row
- *conditional skip:* `AC-64: native double-click generation` if the platform cannot generate it (0 skips in all v0.0.6 runs)

**`flowCovers`** — covers · covers AC-06
- AC-06 UI: list rows render real cover images from the cache
- AC-06 UI: grid cards render cover images
- AC-06 UI: switching back to list keeps covers

**`flowMetadataDisplay`** — metadata-editing · covers UI-06, AC-08, AC-24, DR-85
- UI-06: row heights come from the base + per-line tokens
- AC-08: author and notes render as their own lines under the title
- AC-08: every ellipsized line carries its full text as a tooltip
- AC-08/AC-24/DR-85: the row is exactly as tall as the metadata lines it renders (64 px base + 18 px per line)
- AC-08: an empty field renders no line and reserves no space
- AC-08: the grid card shows the author line and no notes line

**`flowSortSecondary`** — sorting-and-views · covers AC-09, DR-81
- AC-09: with no secondary key the order is the shipped primary, then id
- AC-09: the secondary key orders the ties exactly primary → secondary → id
- AC-09: the secondary key inherits the primary's direction (DR-81)
- AC-09: setting the secondary key changes the order of a tied primary key
- AC-09: the stored order is applied with no user action
- AC-09: the restored order sorts the rows primary → secondary → id
- AC-09: the View menu shows the restored keys as the active ones
- AC-09: the default ordering (title A→Z, no secondary) is restored

**`flowViewColumns`** — sorting-and-views · covers AC-10, AC-31, AC-39, DR-128, DR-44
- AC-10: Auto is the active choice and matches the width-derived count
- AC-31: Auto derives the card width from the container and the row block is the derived card height
- AC-31: a manual count applies immediately and the cards follow it
- AC-10: the manual count clamps at 10 and the + control disables there
- AC-39: the derived layout holds at manual 10 at 1280 px
- AC-10: the manual count clamps at 2 and the − control disables there
- AC-31: a count below Auto widens the cards up to the 320 cap and the leftover becomes even margin
- AC-10: Auto restores the derived count and the derived card width
- AC-10: the manual column count survives a restart and is applied

**`flowContentGutter`** — sorting-and-views · covers AC-39
- AC-39: the grid window carries the 12 px content inset, the token's own value
- AC-39: the derived columns fit the content width — no horizontal overflow

**`flowCategoriesMulti`** — browsing-and-filtering, categories · covers UI-04, AC-17, AC-13, UI-09, AC-23, AC-33
- AC-17: each single category filter still selects exactly its own set
- AC-17: two active categories select exactly their union
- AC-17: a document in both categories is counted once
- AC-13: the status count and the rows agree with the union
- AC-13 / UI-09: the active categories appear as exactly one checked item each
- AC-23: no filter chip renders anywhere while a filter is active
- AC-13 / UI-09: clearing one category in the Browse menu drops that filter and nothing else
- AC-17: the category set combines with a saved search as (A OR …) AND mode
- AC-17: the terms narrow the union instead of replacing it
- AC-17: a broader term returns the whole union, the overlap counted once
- AC-17: an empty category set is identical to the shipped unfiltered list
- AC-13 / AC-23: the restored last filter is the active filter at startup, displayed in the Browse menu
- AC-17: a v0.0.1 `cat:<id>` setting restores as exactly that one category
- AC-13: All documents clears every filter

**`flowImportAssign`** — importing-pdfs · covers AC-18
- AC-18: an import with two categories active assigns the document to both
- AC-18: the import adds exactly one document to the library
- AC-18: the assignment is stored on the document, not on the filter
- *conditional skip:* `AC-18: the drop path itself` when synthesized delivery is unavailable

**`flowCategoryCrud`** — categories · covers AC-14
- AC-14: rename opens the shipped dialog prefilled with the current name
- AC-14: a duplicate name is refused inline and the dialog stays open
- AC-14: renaming updates the manager list
- AC-14: delete asks for confirmation naming the category
- AC-14: discarding the confirmation keeps the category
- AC-14: deleting a category detaches it from documents and deletes no document

**`flowQuietCounts`** — browsing-and-filtering, categories · covers AC-46
- AC-46: a category row's count computes transparent ground, no border, tabular figures

**`flowBrowseIcons`** — browsing-and-filtering · covers AC-48
- AC-48: every Browse menu item renders exactly one 16 px leading glyph

**`flowScrollbars`** — settings-and-appearance · covers AC-15, UI-11, DR-101
- AC-15: the applied ramp declares its color-scheme so UA-drawn chrome follows it
- UI-11: the ${ramp} ramp defines the agreed thumb token ×2 (per ramp)
- UI-11: both ramps define the thumb token in the loaded stylesheet
- AC-15: the measured surfaces include ones that scroll
- AC-15: every scrolling surface draws the token-colored bar
- AC-15: every scrolling surface reserves the same thin gutter
- UI-11: exactly one rule set defines scrollbars — no component overrides it

**`flowDragRegion`** — the-app-window · covers DR-157, AC-19
- AC-19: the toolbar strip carries the deep drag region and every control in it is excluded
- AC-19: pressing the empty strip starts the window drag, pressing a control does not
- AC-19: a double click on the empty strip toggles maximize and a second one restores
- AC-19: a double click on a control is a click on the control, never a window maximize

**`flowToolbarControls`** — the-app-window · covers AC-20, AC-26
- AC-20: no toolbar control renders visible text and every one carries an accessible name
- AC-20: every toolbar control shows a tooltip carrying its accessible name on keyboard focus
- AC-20: the same tooltip appears on pointer hover
- AC-26: no standalone Sort control renders anywhere

**`flowSearchField`** — searching · covers AC-21, UI-14, AC-25, UI-16
- AC-21: the field is magnifier, input, divider, one trailing control
- AC-21: the trailing control is the import control, named
- AC-21: the plus opens exactly Import files and Import folder
- AC-21: while the field holds text the clear button occupies that slot
- AC-25: the placeholder names the current scope while the accessible name stays Search
- AC-21: both items reach their picker — files with the PDF filter, folder as a directory

**`flowRowDesign`** — sorting-and-views · covers UI-03, AC-24
- AC-24: a row renders no selection checkbox and no category badge
- AC-24: a list row measures 64 px with a 45×64 cover
- AC-24: the star, Details and Delete are one actions line, hidden at rest
- AC-24: the Details action renders the info glyph
- AC-24: the actions line appears on keyboard focus
- AC-24: the actions line appears on hover
- AC-24: the category action keeps the tag glyph

**`flowActionParity`** — the-app-window · covers DR-157, AC-32, AC-33
- AC-32: every toolbar control centres its glyph in its own box (|dx|,|dy| ≤ 1 px)
- AC-32: a text control still carries the 10 px side padding
- AC-33: the row actions are one control type — 32×32 boxes on the row's centre line
- AC-32: the row action glyphs are centred in their boxes
- AC-33: the star reports role="switch"
- AC-33: toggling the star flips aria-checked and writes through library_set_favorite
- AC-33: every row action shows the app's own tooltip carrying its accessible name on keyboard focus
- AC-33: every row action shows the same tooltip on pointer hover
- AC-33: in grid the actions are the same control type — 32×32 boxes on one centre line, centred glyphs, the star a switch
- AC-33: every card action shows the app's own tooltip carrying its accessible name on keyboard focus
- AC-33: every card action shows the same tooltip on pointer hover
- AC-33: the card star tracks the favorite state and writes through the same command

**`flowThemeAndSettings`** — settings-and-appearance · covers AC-28, AC-43, UI-17, AC-29, AC-44, UI-22, AC-41, UI-21, AC-49, UI-27
- AC-28: choosing Light switches the whole window to the light ramp immediately
- AC-43: the running app resolves --accent to the corrected light value
- UI-17: the theme submenu shows the chosen theme as its checked item
- AC-28: choosing Dark switches it to the dark ramp
- AC-43: the running app resolves --accent to the corrected dark value
- AC-28: the chosen ramp is applied again after a restart
- AC-28: System follows the operating system
- AC-29: Settings opens the dialog with its two sections
- AC-29: the dialog is focus-trapped
- AC-29: the Library section shows the same counts the Browse menu shows and the same version About shows
- AC-44: the Settings section headings compute text-transform none and letter-spacing normal
- AC-41: the Settings Library section shows the library location, selectable text
- UI-21: the location value is selectable text
- AC-49: the settings section gap and section separation are multiples of 4 px
- AC-29: a view change made in the dialog is live in the View menu and on screen without a reload
- AC-29: the change the View menu made is live in the dialog
- AC-29: Esc closes the settings dialog

**`flowDarkRamp`** — settings-and-appearance · covers AC-70, AC-71, DR-145
- AC-70: the light ramp's token declarations are byte-identical to v0.0.5 (baseline found by the v0.0.5 Ship commit message)
- AC-70: theme.ts, the Settings dialog and the theme menu are unchanged since v0.0.5
- the app applies the dark ramp
- AC-71: the library surface renders as Background #282A36
- AC-71: menus render on Background Light #343746 with Foreground text
- AC-71: a hovered row renders on Background Light #343746
- AC-71: a selected row renders on the selection tint --accent-quiet as mapped (8 % Purple)
- the theme returns to the default (the mechanism is the released one)

**`flowSelectMode`** — selecting-documents · covers DR-157, AC-30, UI-31, AC-64, AC-68, UI-04
- AC-30: Select mode is off at startup
- AC-30 (off): a click on a row changes no selection and takes the row's focus
- AC-30 (off): Space on the focused row selects
- AC-30 (off): Ctrl-click selects and Shift-click extends the range
- AC-30 (off): double-click activates through the reader command, not the OS path
- AC-30: the toolbar toggle turns Select mode on
- AC-30 (on): a click selects and never opens
- AC-30 (on): the BulkBar's favorite action applies to the selection
- AC-30 (on): the BulkBar's favorite action also lifts it again
- AC-30 (on, grid): a click on a card selects it
- AC-30 (off, grid): a click on a card changes no selection
- §5.2: Escape with no overlay open clears the selection
- AC-30: Select mode is off again after a restart

**`flowAbout`** — settings-and-appearance · covers AC-27, UI-17, AC-16, AC-49, UI-27
- AC-27: no app-menu control renders anywhere
- AC-27: the Settings menu is reachable from the toolbar with Tab alone
- AC-27: Enter opens the Settings menu
- UI-17: the Settings menu carries the theme submenu, Settings and About
- AC-16: the About item is reachable and selected with the arrow keys
- AC-16: About opens through the shared modal wrapper
- AC-16: the dialog holds focus inside itself
- AC-16: the dialog shows the application name and version the packaged app reports
- AC-16: no version string exists in the frontend sources
- AC-49: the About dialog's row gap is a multiple of 4 px
- AC-16: Esc closes the About dialog

**`flowWindowChrome`** — the-app-window · covers AC-11, DR-90, DR-88
- AC-11: the toolbar carries Minimize / Maximize / Close as app controls
- AC-11: every window control is keyboard-reachable inside the toolbar
- AC-11: the toolbar strip is the window drag region
- AC-11: the app launches frameless — no title bar or border of its own
- AC-11: Maximize maximizes the window and the control becomes Restore
- AC-11: Restore returns the window to its normal state
- AC-11: Close ends the app
- AC-11: the app relaunches against the same library
- AC-11: Minimize minimizes the window

**`flowKeyboardAudit`** — keyboard-shortcuts
- every toolbar control is keyboard-reachable (tabbable)

**`flowMenuBounds`** — browsing-and-filtering, categories · covers DR-122, AC-34
- AC-34: the Categories submenu panel lies wholly inside the viewport
- AC-34: with 30 categories the submenu scrolls (scrollHeight > clientHeight)
- AC-34: every category in the submenu is reachable by pointer (fully visible at some scroll position)
- AC-34: the last category item highlights on pointer hover at the bottom of the scroll
- AC-34: End in the submenu reaches the last item and focuses it
- AC-34: ArrowDown from the first item reaches every category in the submenu
- AC-34: the View menu panel stays wholly inside the viewport
- AC-34: a row context menu opened beside the window bottom stays wholly inside the viewport

### 3.4 Reader flows (5, CDP runtime, own instance, multi tier imported through the app)

**`flowReaderOpen`** — reading-pdfs · covers AC-64, AC-72
- NFR-08 / AC-72: activation → first page (192-page core fixture) within 800 ms — *measured through the shared `timingRow()` helper, the pattern for all three AC-72 rows below*
- AC-64: a double-click opens a reader window on page 1 with the true page count
- AC-64: Enter opens a reader window for the focused row
- AC-64: the Enter-opened window shows page 1
- AC-64: re-activating the same document opens no second window
- AC-64: a second document opens its own reader window
- AC-64: the library window stayed interactive throughout

**`flowReaderNavigation`** — reading-pdfs · covers AC-65, AC-72, UI-30, DR-156
- NFR-08 / AC-72: page jump → new image visible (192 pages) within 300 ms (page field 1 → 96)
- AC-65: the page field jumps to any page
- AC-65: next reaches the following page
- AC-65: previous returns to the prior page
- AC-65: PgDn scrolls the viewport and reaches the next page
- AC-65: PgUp returns to the page it left
- AC-65: End reaches the last page
- AC-65: only viewport-near pages are mounted (192-page document)
- AC-65: Home reaches the first page
- AC-65: navigation reaches page 1 000 of the scale fixture
- AC-65: the mounted-page bound holds at 1 000 pages

**`flowReaderZoom`** — reading-pdfs · covers AC-66, AC-72, UI-19, DR-158
- NFR-08 / AC-72: zoom change → new image visible within 300 ms (100 % → 75 %)
- AC-66: fit-width is the default — the page fills the content width
- AC-66: 75 % displays 0.75 × the fit-width width
- AC-66: 50 % displays 0.5 × the fit-width width
- AC-66: 125 % displays 1.25 × the fit-width width
- AC-66: 300 % displays 3 × the fit-width width
- AC-66: the Fit width control returns to 100 % at the fit-width width
- AC-66: fit-width re-derives when the window is resized
- AC-66: fit-width re-derives back when the size is restored

**`flowReaderClose`** — reading-pdfs · covers AC-67, DR-149
- AC-67: the reader page cache exists while the window is open
- AC-67: Esc closes the reader window
- AC-67: the reader cache directory is gone after close
- AC-67: closing one reader window leaves another document's window open
- AC-67: the window's Close control closes the reader window
- AC-67: the Close control removes that cache too
- AC-67: the library is unchanged while reader windows open and close
- AC-67: the library window is interactive throughout
- AC-67: deleting the document closes its reader window with the row

**`flowReaderErrors`** — reading-pdfs · covers AC-69, FR-12, DR-149
- AC-69: a missing document yields a toast with Relink and no window
- AC-69: an unrenderable file shows the reader error state with the external action
- AC-69: the action performs the external open exactly once at the command boundary

### 3.5 Area → flow mapping (the `SMOKE_SET` vocabulary; suite-enforced against orphans)

|Area (= guide page name)|Flows|
|---|---|
|getting-started|flowStartup, flowDropAndSkip — *the bulk empty/skeleton case: `scripts/ui-10k.mjs` (DR-161)*|
|importing-pdfs|flowImportAssign, flowMetaColumn — *the 10 000-document suite: `scripts/ui-10k.mjs` (DR-159, DR-161)*|
|searching|flowSearchDebounce, flowSearchField|
|browsing-and-filtering|flowCategories, flowCategoriesMulti, flowBrowseIcons, flowMenuBounds, flowQuietCounts|
|categories|flowCategories, flowCategoriesMulti, flowCategoryCrud, flowMenuBounds, flowQuietCounts|
|favorites|flowFavorites|
|opening-and-deleting|flowOpen, flowDelete, flowContextMenu|
|reading-pdfs|flowReaderOpen, flowReaderNavigation, flowReaderZoom, flowReaderClose, flowReaderErrors|
|metadata-editing|flowMetadata, flowMetadataDisplay, flowMetaColumn|
|missing-files-relinking|flowMissingAndRelink|
|covers|flowCovers|
|sorting-and-views|flowSortSecondary, flowViewColumns, flowContentGutter, flowRowDesign — *the scale mount bound + width matrix: `scripts/ui-10k.mjs` (DR-161)*|
|status-feedback|flowStatusBar, flowProgressTransform|
|selecting-documents|flowSelectMode|
|settings-and-appearance|flowThemeAndSettings, flowDarkRamp, flowAbout, flowScrollbars|
|the-app-window|flowDragRegion, flowWindowChrome, flowToolbarControls, flowActionParity|
|keyboard-shortcuts|flowKeyboardAudit|

---

## 4. 10 000-document suite — `scripts/ui-10k.mjs` (DR-159, consolidated by DR-161)

Separated runner holding **every UI test case against the 10 000-document corpus** — no regular ui-smoke run pays the corpus any more. Same app, same tauri-driver session; imports the shared plumbing (`prepareEnvironment`, `startDriver`, `openSession`, `runFlow`, `check`, tier helpers) **and the three exported scale flows** from `ui-smoke.mjs`, which only runs its own suite when executed as the program. Runs the mandatory prefix flows first (AC-60), then its four flows in fixed order: the measured import (it loads the corpus the scale flows then run against), virtualization, the width matrix, empty/skeleton last (it empties the library through the app's own bulk path). Exit 0/1.

**Run modes (DR-163).** No selection: the full fixed-order run above — the corpus is paid exactly once (DR-161), the measured import doubling as the corpus the scale flows run against. `SMOKE_10K_FLOW=<flow>[,<flow>…]`: selects exactly those flows (unknown names error out before any app work; the relative order above is preserved). In both modes the prefix flows run; with `SMOKE_PREFIX_QUIET=1` — set for every lane — they run as setup (passing checks log but are not recorded, failures are recorded). A selection that does not include `flowImport10k` pays the corpus with `prepareCorpus` instead: the same import, check-quiet (internal asserts only, a deliberately more patient 90 s completion wait) — the measured claims (AC-01 ×2, AC-22, NFR-02, FR-11, FR-15, AC-57) belong to the import lane's test case only. The suite-level budget check records in **every** mode, including a single-flow lane.

**Suite-level check (DR-162):** wall-time budget — suite total ≤ 300 s, the same NFR-06/AC-58 assertion the core suite makes, now on this side too. Under `scripts/ui-verify.mjs` full mode each of the four flows is its own lane with its own data directory (`%APPDATA%\com.pdfkeeper.app\parallel\lanes\flowImport10k` and `…\lanes\flowVirtualization` / `…flowWidthMatrix` / `…flowEmptyAndSkeleton`); a lane's directory starts empty, so the three scale lanes each pay the corpus as their `prepareCorpus` setup phase (§4 Run modes) — the corpus is imported four times per full-mode run, measured once and as setup three times. The lane's own budget check is its single suite-level check (the +1 over its flow's call sites). In `--coarse` mode the whole suite runs as the `docs` lane (`…\parallel\docs`). Either way the run is scoped: its own driver ports, and cleanup that touches only its own process tree.

**`flowImport10k`** · covers UI-15, AC-22, AC-57, AC-01, NFR-02, FR-15, FR-11, DR-134 — 6 checks
- AC-01 UI: 10,000 documents listed via the app *(count claim derived from the fixture tier size)*
- AC-22: the status bar shows the progress bar while a job runs
- AC-01 UI: whole import completes < 30 s (NFR-02)
- import result toast reports the batch (FR-15)
- AC-01 UI: duplicate import is skipped with a notice (FR-11)
- AC-57: cover backfill throughput ≥ 2× the 27/s baseline (real app, 10 000-document corpus) — sampled from the run's own status-bar cover progress; the 27/s baseline is the v0.0.4 serial queue measured in SPEC-v0.0.5 §5

**`flowVirtualization`** — scale half of sorting-and-views *(self-sufficient: establishes its own full-list query)* · covers NFR-01
- NFR-01 UI: mounted document nodes stay bounded with 10,000 documents

**`flowWidthMatrix`** — scale half of sorting-and-views · covers AC-56, AC-35, AC-39, AC-59, DR-128 — *parameterized: runs per tested window width*
- AC-35/AC-39 (${width} px, Auto): the grid is the derived layout — cards and height exact, cover inside the card, one border, 12 px gutter, no overflow, mounted bounded
- AC-35/AC-39 (${width} px, manual 2 → ${minExp.columns} columns): the derived layout holds at the lower clamp edge
- AC-35/AC-39 (${width} px, manual 10 → ${maxExp.columns} columns): the derived layout holds at the upper clamp edge
- AC-39 (${width} px, list): the first row starts at the 12 px content inset and the meta column keeps the other edge clear

**`flowEmptyAndSkeleton`** — scale half of getting-started *(scale-only because "Select all N matching" exists only above 500 documents, DR-136)* · covers AC-49, AC-51, UI-29, AC-50, UI-28
- empty-library flow: Ctrl+A opened the bulk bar
- the bulk bar's Select-all-matching selects the whole library
- the confirmation names the whole selection
- empty-library flow: the library is empty
- AC-49: the toast stack gap and vertical padding are multiples of 4 px
- AC-51: the hint renders the combination as keycap elements, text content unchanged
- AC-51: the keycaps are monospace, on a surface-2 ground, with a hairline border and 6 px radius
- AC-49: the empty state's vertical rhythm is a multiple of 4 px
- AC-50: the skeleton row is the real row block (64 px) with the real cover placeholder (45×64)
- AC-50: the meta placeholder reserves the fixed 96 px column at the row's inset

---

## 5. Support scripts (not tests; prerequisites for the layers above)

|Script|Role|
|---|---|
|`scripts/make-fixtures.mjs`|generates every fixture: docs tier (10 000 single-page PDFs), core tier (100, equal byte sizes, one without Info, manifests for the harness), multi-page fixtures (12/24/48/96/192-page core + the 1 000-page scale fixture), and the special fixtures (encrypted-looking, malformed, non-PDF, the differently-named meta-column probe). D15: fixtures are generated, never committed|
|`scripts/fetch-pdfium.mjs`|fetches the bundled pdfium the reader engine links against|
|`scripts/make-app-icon.mjs`|generates the packaged app icon|

---

## 6. Maintenance rule (AGENTS.md §2a; DR-160)

- **New feature:** while its feature spec's Technical design is implemented, add its rows to this inventory in the same change as the tests themselves — Rust `#[test]` names, Vitest items, new flows (and their area entries) with their check lists. The Build ledger stays the requirement→test authority; this file records the tests as they exist.
- **Bugfix:** the regression test it ships with (RULES R6 / verification workflow) gets a row here, marked with the bug's DR.
- **Removed or renamed test:** remove or rename its row in the same change; IDs in `covers` columns are never renumbered.
- **At the Ship commit:** the inventory is verified against the tree (the extraction is mechanical: `#[test]`, `it()/test()`, `check()/skip()` call sites) and the counts in the header table are corrected. This document is not frozen at Ship — unlike release specs it keeps living.
- The area table in §3.5 and the `AREAS` map in `ui-smoke.mjs` are one fact: whichever changes, both change together (the suite's AC-60 orphan check enforces the pairing at runtime). The scale halves of `getting-started` and `sorting-and-views` are verified by the 10k suite (§4), not by a named set (DR-161).
