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
  }: {
    title: string;
    body: string;
    actionLabel?: string;
    onaction?: () => void;
    hint?: string;
  } = $props();
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
      <p class="hint">{hint}</p>
    {/if}
  {/if}
</div>

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
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
</style>
