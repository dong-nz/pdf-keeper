<script lang="ts">
  // Settings dialog (UI-17 OQ-20 as restructured by SPEC-v0.0.7 §3.14): the
  // application settings surface with two sections — Appearance (theme, view
  // mode, columns) and Data location (the path the app writes to, shown and
  // openable). The Library section is gone with the release: the counts are
  // the status bar's `status_updated` display (FR-15) and the name/version
  // are the About dialog's (UI-12) — the facts moved, they were not deleted.
  // It is a second entry point to the same state, not a second copy of it:
  // every control reads and writes the settings store the toolbar menus use,
  // so a change here is visible in the View menu and the Settings menu
  // without a reload (AC-29), and vice versa. Focus-trapped and Esc-closing
  // through the kit's dialog (Modal.svelte, DR-63): the component owns
  // `open` and reports the close through `ondone`.
  import Modal from "./Modal.svelte";
  import Icon from "./Icon.svelte";
  import Tooltip from "./Tooltip.svelte";
  import { settings } from "$lib/state/settings.svelte";
  import { layout } from "$lib/state/layout.svelte";
  import { feedback } from "$lib/state/feedback.svelte";
  import { GRID_COLUMNS_MAX, GRID_COLUMNS_MIN, stepColumns } from "$lib/virtual";
  import { t, type MsgKey } from "$lib/i18n";
  import type { IconName } from "./icons";
  import type { Theme, ViewMode } from "$lib/types";
  import * as api from "../api";
  import { asAppError } from "$lib/types";

  let { ondone }: { ondone: () => void } = $props();

  const THEMES: { value: Theme; labelKey: MsgKey; icon: IconName }[] = [
    { value: "system", labelKey: "theme.auto", icon: "auto" },
    { value: "light", labelKey: "theme.light", icon: "sun" },
    { value: "dark", labelKey: "theme.dark", icon: "moon" },
  ];

  const MODES: { value: ViewMode; labelKey: MsgKey; icon: IconName }[] = [
    { value: "list", labelKey: "toolbar.view.list", icon: "list" },
    { value: "grid", labelKey: "toolbar.view.grid", icon: "grid" },
  ];

  let open = $state(true);
  // UI-21 (DR-111): the data location is shown read-only, fetched once when
  // the dialog opens, from the command that reads the same source the app
  // writes to. No path picker, no write path (R1.4); the one action is the
  // OS file-manager open through `app_open_data_dir` (UI-21 MODIFIED,
  // DR-191) — a Rust-side call, the frontend never opens OS paths itself.
  let dataDir = $state<string | null>(null);

  $effect(() => {
    void api
      .appDataDir()
      .then((value) => (dataDir = value))
      .catch(() => {
        /* no answer: the row stays empty, the dialog is still readable */
      });
  });

  function openDataLocation(): void {
    void api.appOpenDataDir().catch((error: unknown) => {
      feedback.reportError(asAppError(error));
    });
  }

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
          <Tooltip text={t("toolbar.view.columns.decrease")}>
            {#snippet control({ props })}
              <button
                class="icon-button"
                type="button"
                disabled={effective <= GRID_COLUMNS_MIN}
                aria-label={t("toolbar.view.columns.decrease")}
                {...props}
                onclick={() => settings.setGridColumns(stepColumns(effective, -1))}
              >
                <Icon name="minus" />
              </button>
            {/snippet}
          </Tooltip>
          <span class="columns-count tabular">{effective}</span>
          <Tooltip text={t("toolbar.view.columns.increase")}>
            {#snippet control({ props })}
              <button
                class="icon-button"
                type="button"
                disabled={effective >= GRID_COLUMNS_MAX}
                aria-label={t("toolbar.view.columns.increase")}
                {...props}
                onclick={() => settings.setGridColumns(stepColumns(effective, 1))}
              >
                <Icon name="plus" />
              </button>
            {/snippet}
          </Tooltip>
        </span>
      </div>
    </div>
  </section>

  <section class="settings-section">
    <h3 class="section-title">{t("settings.dataLocation")}</h3>
    <div class="location-row">
      <!-- The path the app itself writes to (library.db + covers/ live
           here); selectable like every other path the app shows (UI-21).
           The row's one action: open it in the OS file manager — the
           32×32 icon control of the AC-33 grammar. -->
      <span class="location">{dataDir ?? ""}</span>
      <Tooltip text={t("settings.openLocation")}>
        {#snippet control({ props })}
          <button
            {...props}
            class="control icon-button"
            type="button"
            aria-label={t("settings.openLocation")}
            onclick={openDataLocation}
          >
            <Icon name="folder" />
          </button>
        {/snippet}
      </Tooltip>
    </div>
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

  /* Data location row (UI-21 MODIFIED): the path fills the row, the open
     control sits at its end; the released selectable-text location styling
     carries over unchanged. */
  .location-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .location {
    flex: 1;
    min-width: 0;
    user-select: all;
    font-size: var(--text-13);
    color: var(--text-primary);
    overflow-wrap: anywhere;
  }
</style>
