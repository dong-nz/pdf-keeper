<script lang="ts">
  // Empty states (UI-08, §5.3.8): heading + the actions that fill it.
  import Icon from "./Icon.svelte";

  let {
    title,
    body,
    actionLabel,
    onaction,
    keys,
    actionLabel2,
    onaction2,
    keys2,
  }: {
    title: string;
    body: string;
    actionLabel?: string;
    onaction?: () => void;
    /** UI-29 (AC-51): a key combination catalog value ("Ctrl+I"), rendered
     *  as keycaps below its action button; only the empty-library state passes it. */
    keys?: string;
    /** UI-29 as modified (AC-115, DR-272/DR-274): the second action button,
     *  same neutral form, its keycaps below it. */
    actionLabel2?: string;
    onaction2?: () => void;
    keys2?: string;
  } = $props();

  const keycaps = $derived(keys ? keys.split("+") : []);
  const keycaps2 = $derived(keys2 ? keys2.split("+") : []);
</script>

<div class="empty-state">
  <span class="glyph"><Icon name="pdf-glyph" size={20} /></span>
  <h2>{title}</h2>
  <p>{body}</p>
  {#if actionLabel && onaction}
    <div class="actions">
      <!-- DR-274: when a state offers two equal import actions, both buttons
           are neutral; a single-action state keeps the released primary form. -->
      <div class="action">
        <button class={`control${actionLabel2 && onaction2 ? "" : " control-primary"}`} onclick={onaction}>
          <Icon name="import" />
          <span>{actionLabel}</span>
        </button>
        {#if keycaps.length > 0}
          <span class="combo">
            {#each keycaps as key, i (i)}
              {#if i > 0}<span class="key-plus">+</span>{/if}<kbd class="keycap">{key}</kbd>
            {/each}
          </span>
        {/if}
      </div>
      {#if actionLabel2 && onaction2}
        <div class="action">
          <button class="control" onclick={onaction2}>
            <Icon name="folder" />
            <span>{actionLabel2}</span>
          </button>
          {#if keycaps2.length > 0}
            <span class="combo">
              {#each keycaps2 as key, i (i)}
                {#if i > 0}<span class="key-plus">+</span>{/if}<kbd class="keycap">{key}</kbd>
              {/each}
            </span>
          {/if}
        </div>
      {/if}
    </div>
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

  /* DR-272/DR-274: the two equal import actions side by side — 8 px on the
     4 px scale; each button's keycaps sit below it in its own column. */
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }

  .action {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .combo {
    display: inline-flex;
    align-items: center;
    gap: 4px;
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
