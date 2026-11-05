<script lang="ts">
  // Empty states (UI-08, §5.3.8): heading + the action that fills it.
  import { t } from "$lib/i18n";
  import Icon from "./Icon.svelte";

  let {
    title,
    body,
    actionLabel,
    onaction,
    hint,
    keys,
  }: {
    title: string;
    body: string;
    actionLabel?: string;
    onaction?: () => void;
    hint?: string;
    /** UI-29 (AC-51): a key combination catalog value ("Ctrl+I"), rendered
     *  as keycaps; only the empty-library state passes it. */
    keys?: string;
  } = $props();

  const keycaps = $derived(keys ? keys.split("+") : []);
</script>

<div class="empty-state">
  <span class="glyph"><Icon name="pdf-glyph" size={20} /></span>
  <h2>{title}</h2>
  <p>{body}</p>
  {#if actionLabel && onaction}
    <button class="control control-primary" onclick={onaction}>
      <Icon name="import" />
      <span>{actionLabel}</span>
    </button>
    {#if hint}
      <p class="hint">
        {hint}
        {#each keycaps as key, i (i)}
          {#if i > 0}<span class="key-plus">+</span>{/if}<kbd class="keycap">{key}</kbd>
        {/each}
      </p>
    {/if}
  {/if}
</div>

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    /* UI-27 (AC-49): centered stack — 12 px on the 4 px scale. */
    gap: 12px;
    padding: 64px 24px;
    text-align: center;
  }

  .glyph {
    color: var(--text-tertiary);
  }

  h2 {
    font-size: var(--text-22);
    font-weight: 600;
    margin: 0;
  }

  p {
    color: var(--text-secondary);
    font-size: var(--text-13);
    margin: 0;
    max-width: 420px;
  }

  .hint {
    font-size: var(--text-11);
    color: var(--text-tertiary);
  }

  /* UI-29 (AC-51): the key combination renders as keycaps — monospace,
     surface-2 ground, hairline border, 6 px radius — not as prose. */
  .keycap {
    font-family: var(--font-mono);
    font-size: var(--text-11);
    background: var(--surface-2);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-control);
    padding: 2px 6px;
  }
</style>
