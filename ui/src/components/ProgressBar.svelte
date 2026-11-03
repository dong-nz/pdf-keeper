<script lang="ts">
  // Progress bar (UI-08): shown only while a job event stream is active;
  // fed by the `library_job_progress` events (processed/total).
  import { feedback } from "$lib/state/feedback.svelte";
  import { t, type MsgKey } from "$lib/i18n";
  import { formatCount } from "$lib/format";

  const JOB_KEYS: Record<string, MsgKey> = {
    import: "job.import",
    rescan: "job.rescan",
    cover: "job.cover",
  };

  const job = $derived(feedback.job);
  const label = $derived(job ? (JOB_KEYS[job.kind] ?? "job.import") : "job.import");
</script>

{#if job}
  <div class="progress-wrap" role="group" aria-label={t(label)}>
    <span class="progress-label">{t(label)} <span class="tabular">{formatCount(job.processed)}/{formatCount(job.total)}</span></span>
    <div
      class="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={job.total}
      aria-valuenow={job.processed}
      aria-valuetext={t("a11y.progress", { label: t(label), processed: formatCount(job.processed), total: formatCount(job.total) })}
    >
      <span class="progress-fill" style="width: {job.total === 0 ? 0 : Math.min(100, (job.processed / job.total) * 100)}%"></span>
    </div>
  </div>
{/if}

<style>
  .progress-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 240px;
  }

  .progress-label {
    font-size: var(--text-12);
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .progress {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: var(--surface-3);
    overflow: hidden;
  }

  .progress-fill {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width var(--duration-base) var(--ease);
  }
</style>
