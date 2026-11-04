<script lang="ts">
  // Settings menu (UI-17): the toolbar's right-end control, icon-only with a
  // tooltip (UI-13). Items in order: the theme submenu — its trigger shows the
  // theme currently chosen (DR-102b) and opens System / Light / Dark with the
  // active one checked; Settings… (the dialog); About PDF Keeper… (UI-12 as
  // modified, reached from here now that the app menu is gone).
  // Every write goes through the settings store — the one path to the key
  // (R1.6), the same one the dialog uses.
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
    { value: "system", labelKey: "theme.system", icon: "monitor" },
    { value: "light", labelKey: "theme.light", icon: "sun" },
    { value: "dark", labelKey: "theme.dark", icon: "moon" },
  ];

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
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger class="menu-item">
        <span class="item-label">
          <Icon name={current.icon} />
          <span>{t(current.labelKey)}</span>
        </span>
        <Icon name="chevron-right" />
      </DropdownMenu.SubTrigger>
      <DropdownMenu.SubContent class="menu settings-sub">
        {#each THEMES as theme (theme.value)}
          <DropdownMenu.Item
            class="menu-item"
            data-active={settings.theme === theme.value || undefined}
            onSelect={() => settings.setTheme(theme.value)}
          >
            <span class="item-label">
              <Icon name={theme.icon} />
              <span>{t(theme.labelKey)}</span>
            </span>
            {#if settings.theme === theme.value}
              <Icon name="check" />
            {/if}
          </DropdownMenu.Item>
        {/each}
      </DropdownMenu.SubContent>
    </DropdownMenu.Sub>

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
