<script lang="ts">
  // Settings menu (UI-17 as modified by SPEC-v0.0.7 §3.13): the toolbar's
  // right-end control, icon-only with a tooltip (UI-13). Items in order:
  // one theme action item — its icon and label display the theme currently
  // in effect, and activating it advances one step of the fixed cycle
  // Light → Dark → Auto; the menu stays open across the activation and the
  // item re-renders with the new current mode (DR-209 — `closeOnSelect
  // false`, the kit's declarative stay-open). Settings… (the dialog);
  // About PDF Keeper… (UI-12 as modified).
  // Every write goes through the settings store — the one path to the key
  // (R1.6), the same one the dialog uses. The internal value for Auto stays
  // `system` — only the name changed (§3.13); no data-model change.
  import { DropdownMenu } from "bits-ui";
  import Icon from "./Icon.svelte";
  import OverlayAnchor from "./OverlayAnchor.svelte";
  import Tooltip from "./Tooltip.svelte";
  import SettingsDialog from "./SettingsDialog.svelte";
  import AboutDialog from "./AboutDialog.svelte";
  import { settings } from "$lib/state/settings.svelte";
  import { t, type MsgKey } from "$lib/i18n";
  import type { IconName } from "./icons";
  import type { Theme } from "$lib/types";

  const THEMES: { value: Theme; labelKey: MsgKey; icon: IconName }[] = [
    { value: "system", labelKey: "theme.auto", icon: "auto" },
    { value: "light", labelKey: "theme.light", icon: "sun" },
    { value: "dark", labelKey: "theme.dark", icon: "moon" },
  ];

  // The cycle of §3.13: Light → Dark → Auto → Light; from Auto the first
  // activation sets Light.
  const NEXT: Record<Theme, Theme> = { light: "dark", dark: "system", system: "light" };

  const current = $derived(THEMES.find((theme) => theme.value === settings.theme) ?? THEMES[0]);

  let open = $state(false);
  let dialogOpen = $state(false);
  let aboutOpen = $state(false);
</script>

<DropdownMenu.Root bind:open>
  <Tooltip text={t("settings.menu")}>
    {#snippet control({ props })}
      <DropdownMenu.Trigger
        {...props}
        class="control icon-button settings-trigger"
        aria-label={t("settings.menu")}
        data-tauri-drag-region="false"
      >
        <Icon name="settings" />
      </DropdownMenu.Trigger>
    {/snippet}
  </Tooltip>

  <DropdownMenu.Content class="menu settings-menu">
    <OverlayAnchor />
    <DropdownMenu.Item
      class="menu-item"
      closeOnSelect={false}
      onSelect={() => settings.setTheme(NEXT[settings.theme])}
    >
      <span class="item-label">
        <Icon name={current.icon} />
        <span>{t("settings.theme")}: {t(current.labelKey)}</span>
      </span>
    </DropdownMenu.Item>

    <DropdownMenu.Separator class="menu-sep" />
    <DropdownMenu.Item class="menu-item" onSelect={() => (dialogOpen = true)}>
      <span class="item-label">
        <Icon name="settings" />
        <span>{t("settings.open")}</span>
      </span>
    </DropdownMenu.Item>
    <DropdownMenu.Item class="menu-item" onSelect={() => (aboutOpen = true)}>
      <span class="item-label">
        <Icon name="info" />
        <span>{t("menu.about")}</span>
      </span>
    </DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>

{#if dialogOpen}
  <SettingsDialog ondone={() => (dialogOpen = false)} />
{/if}
{#if aboutOpen}
  <AboutDialog ondone={() => (aboutOpen = false)} />
{/if}
