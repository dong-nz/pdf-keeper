<script lang="ts">
  // First-paint placeholder (UI-08): skeleton rows, never a spinner (§5.3.7).
  let { rows = 8 }: { rows?: number } = $props();
</script>

<div class="skeletons" aria-hidden="true">
  {#each Array(rows) as _, i (i)}
    <div class="skeleton-row">
      <span class="box cover"></span>
      <span class="line title"></span>
      <span class="line short"></span>
    </div>
  {/each}
</div>

<style>
  .skeletons {
    padding: 8px 12px;
  }

  .skeleton-row {
    display: flex;
    align-items: center;
    gap: 12px;
    height: var(--row-height);
  }

  .box,
  .line {
    border-radius: var(--radius-control);
    background: linear-gradient(90deg, var(--surface-2) 25%, var(--surface-3) 50%, var(--surface-2) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s var(--ease) infinite;
  }

  .cover {
    width: 34px;
    height: 48px;
  }

  .title {
    flex: 1;
    max-width: 420px;
    height: 12px;
  }

  .short {
    width: 120px;
    height: 12px;
  }

  @keyframes shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: -100% 0;
    }
  }
</style>
