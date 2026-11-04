<script lang="ts">
  // App menu (UI-12): the app's own menu at the toolbar's right end, left of
  // the window controls. Its only item is About — no links, no other entries.
  // Same kit pattern as SortMenu (DR-45); the dialog is owned here as a
  // component, never as a bare <Modal> in an {#if} block (DR-63).
  import { DropdownMenu } from "bits-ui";
  import Icon from "./Icon.svelte";
  import OverlayAnchor from "./OverlayAnchor.svelte";
  import AboutDialog from "./AboutDialog.svelte";
  import { t } from "$lib/i18n";

  let open = $state(false);
  let about = $state(false);
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger class="control icon-button" aria-label={t("menu.app")} title={t("menu.app")}>
    <Icon name="info" />
  </DropdownMenu.Trigger>
  <DropdownMenu.Content class="menu app-menu">
    <OverlayAnchor />
    <DropdownMenu.Item class="menu-item" onSelect={() => (about = true)}>
      <span>{t("menu.about")}</span>
    </DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>

{#if about}
  <AboutDialog ondone={() => (about = false)} />
{/if}
