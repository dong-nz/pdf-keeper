<script lang="ts">
  // Settings dialog (UI-17, OQ-20): the application settings surface with the
  // two agreed sections — Appearance (theme, view mode, columns) and Library
  // (counts, name, version). It is a second entry point to the same state, not
  // a second copy of it: every control reads and writes the settings store and
  // the library store the toolbar menus use, so a change here is visible in the
  // View menu and the Settings menu without a reload (AC-29), and vice versa.
  // Focus-trapped and Esc-closing through the kit's dialog (Modal.svelte,
  // DR-63): the component owns `open` and reports the close through `ondone`.
  import Modal from "./Modal.svelte";
  import Icon from "./Icon.svelte";
  import { settings } from "$lib/state/settings.svelte";
  import { library } from "$lib/state/library.svelte";
  import { layout } from "$lib/state/layout.svelte";
  import { GRID_COLUMNS_MAX, GRID_COLUMNS_MIN, stepColumns } from "$lib/virtual";
  import { formatCount } from "$lib/format";
  import { t, type MsgKey } from "$lib/i18n";
  import type { IconName } from "./icons";
  import type { Theme, ViewMode } from "$lib/types";
  import type { AboutDto } from "$lib/types";
  import * as api from "../api";

  let { ondone }: { ondone: () => void } = $props();

  const THEMES: { value: Theme; labelKey: MsgKey; icon: IconName }[] = [
    { value: "system", labelKey: "theme.system", icon: "monitor" },
    { value: "light", labelKey: "theme.light", icon: "sun" },
    { value: "dark", labelKey: "theme.dark", icon: "moon" },
  ];

  const MODES: { value: ViewMode; labelKey: "toolbar.view.list" | "toolbar.view.grid"; icon: "list" | "grid" }[] = [
    { value: "list", labelKey: "toolbar.view.list", icon: "list" },
    { value: "grid", labelKey: "toolbar.view.grid", icon: "grid" },
  ];

  let open = $state(true);
  let info = $state<AboutDto | null>(null);
  // UI-21 (DR-111): the library location is shown read-only, fetched once
  // when the dialog opens, from the command that reads the same source the
  // app writes to. No control, no write path (R1.4).
  let dataDir = $state<string | null>(null);

  // The same runtime read About does — the version is never written in the
  // frontend (DR-79), and the counts are the store's `status_updated` values,
  // never a second query (FR-15's invariant).
  $effect(() => {
    void api
      .appAbout()
      .then((value) => (info = value))
      .catch(() => {
        /* no answer: the rows stay empty, the dialog is still readable */
      });
    void api
      .appDataDir()
      .then((value) => (dataDir = value))
      .catch(() => {
        /* no answer: the row stays empty, the dialog is still readable */
      });
  });

  $effect(() => {
    if (!open) ondone();
  });

  const override = $derived(settings.gridColumns);
  const auto = $derived(override === "auto");
  const effective = $derived(override === "auto" ? layout.autoColumns : override);
</script>

<Modal title={t("settings.title")} width={560} bind:open>
  <section class="settings-section">
    <h3 class="section-title">{t("settings.appearance")}</h3>

    <div class="setting-row">
      <span class="setting-label">{t("settings.theme")}</span>
      <div class="setting-control" role="radiogroup" aria-label={t("settings.theme")}>
        {#each THEMES as option (option.value)}
          <button
            class="control"
            type="button"
            role="radio"
            aria-checked={settings.theme === option.value}
            data-active={settings.theme === option.value || undefined}
            onclick={() => settings.setTheme(option.value)}
          >
            <Icon name={option.icon} />
            <span>{t(option.labelKey)}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="setting-row">
      <span class="setting-label">{t("settings.viewMode")}</span>
      <div class="setting-control" role="radiogroup" aria-label={t("settings.viewMode")}>
        {#each MODES as option (option.value)}
          <button
            class="control"
            type="button"
            role="radio"
            aria-checked={settings.view === option.value}
            data-active={settings.view === option.value || undefined}
            onclick={() => settings.setView(option.value)}
          >
            <Icon name={option.icon} />
            <span>{t(option.labelKey)}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="setting-row">
      <span class="setting-label">{t("toolbar.view.columns")}</span>
      <div class="setting-control">
        <button
          class="control"
          type="button"
          data-active={auto || undefined}
          aria-pressed={auto}
          onclick={() => settings.setGridColumns("auto")}
        >
          <span>{t("toolbar.view.columns.auto")}</span>
        </button>
        <span class="columns-stepper">
          <button
            class="icon-button"
            type="button"
            disabled={effective <= GRID_COLUMNS_MIN}
            aria-label={t("toolbar.view.columns.decrease")}
            title={t("toolbar.view.columns.decrease")}
            onclick={() => settings.setGridColumns(stepColumns(effective, -1))}
          >
            <Icon name="minus" />
          </button>
          <span class="columns-count tabular">{effective}</span>
          <button
            class="icon-button"
            type="button"
            disabled={effective >= GRID_COLUMNS_MAX}
            aria-label={t("toolbar.view.columns.increase")}
            title={t("toolbar.view.columns.increase")}
            onclick={() => settings.setGridColumns(stepColumns(effective, 1))}
          >
            <Icon name="plus" />
          </button>
        </span>
      </div>
    </div>
  </section>

  <section class="settings-section">
    <h3 class="section-title">{t("settings.library")}</h3>

    <dl class="info-list">
      <div class="info-row">
        <dt>{t("settings.libraryDocuments")}</dt>
        <dd class="tabular">{formatCount(library.counts.total)}</dd>
      </div>
      <div class="info-row">
        <dt>{t("settings.libraryFavorites")}</dt>
        <dd class="tabular">{formatCount(library.counts.favorites)}</dd>
      </div>
      <div class="info-row">
        <dt>{t("settings.libraryMissing")}</dt>
        <dd class="tabular">{formatCount(library.counts.missing)}</dd>
      </div>
      <div class="info-row">
        <dt>{t("about.name")}</dt>
        <dd>{info?.name ?? ""}</dd>
      </div>
      <div class="info-row">
        <dt>{t("about.version")}</dt>
        <dd class="tabular">{info?.version ?? ""}</dd>
      </div>
      <div class="info-row">
        <dt>{t("settings.libraryLocation")}</dt>
        <!-- the path the app itself writes to (library.db + covers/ live
             here); selectable like every other path the app shows -->
        <dd class="location">{dataDir ?? ""}</dd>
      </div>
    </dl>
  </section>
</Modal>

<style>
  .settings-section {
    display: flex;
    flex-direction: column;
    /* UI-27 (AC-49): centered stack — 12 px on the 4 px scale. */
    gap: 12px;
  }

  .settings-section + .settings-section {
    /* UI-27: the section separation 18→16 px; the 1 px hairline carries it
       (UI-22). */
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border-hairline);
  }

  .section-title {
    /* UI-22 (AC-44): the dialog's own sentence-case scale — no uppercase
       transform, no tracking, 13 px. The hairline section separation (§3.13
       via UI-27) carries the separation the transform used to carry. */
    margin: 0;
    font-size: var(--text-13);
    font-weight: 600;
    letter-spacing: normal;
    color: var(--text-secondary);
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .setting-label {
    font-size: var(--text-13);
    color: var(--text-secondary);
  }

  .setting-control {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .columns-stepper {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-left: 8px;
  }

  .columns-count {
    min-width: 24px;
    text-align: center;
    font-size: var(--text-13);
    color: var(--text-secondary);
  }

  .info-list {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .info-row {
    display: grid;
    grid-template-columns: 160px minmax(0, 1fr);
    align-items: baseline;
    gap: 12px;
  }

  .info-row dt {
    font-size: var(--text-12);
    color: var(--text-tertiary);
  }

  .info-row dd {
    margin: 0;
    font-size: var(--text-13);
    color: var(--text-primary);
    overflow-wrap: anywhere;
  }

  .info-row dd.location {
    user-select: all;
  }
</style>
