<script lang="ts">
  // About dialog (UI-12): application name and version read from the packaged
  // app through the whitelisted `app_about` command — the version is never
  // written in the frontend (DR-79). Read-only: no inputs, no actions, no
  // settings, nothing persisted. Follows the RenameCategoryDialog mount rule
  // (DR-63): the component owns `open` and reports the close through `ondone`.
  import Modal from "./Modal.svelte";
  import * as api from "../api";
  import type { AboutDto } from "$lib/types";
  import { t } from "$lib/i18n";

  let { ondone }: { ondone: () => void } = $props();

  let open = $state(true);
  let info = $state<AboutDto | null>(null);

  $effect(() => {
    void api
      .appAbout()
      .then((value) => (info = value))
      .catch(() => {
        /* no answer: the rows stay empty, the dialog is still readable */
      });
  });

  $effect(() => {
    if (!open) ondone();
  });
</script>

<Modal title={t("about.title")} width={420} bind:open>
  <dl class="about">
    <div class="about-row">
      <dt>{t("about.name")}</dt>
      <dd>{info?.name ?? ""}</dd>
    </div>
    <div class="about-row">
      <dt>{t("about.version")}</dt>
      <dd class="tabular">{info?.version ?? ""}</dd>
    </div>
  </dl>
</Modal>

<style>
  .about {
    margin: 0;
    display: flex;
    flex-direction: column;
    /* UI-27 (AC-49): form stack — 8 px on the 4 px scale. */
    gap: 8px;
  }

  .about-row {
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr);
    align-items: baseline;
    gap: 12px;
  }

  .about-row dt {
    font-size: var(--text-12);
    color: var(--text-tertiary);
  }

  .about-row dd {
    margin: 0;
    font-size: var(--text-13);
    color: var(--text-primary);
    overflow-wrap: anywhere;
  }
</style>
