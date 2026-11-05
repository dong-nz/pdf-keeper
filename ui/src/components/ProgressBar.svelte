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
      <span class="progress-fill" style="--p: {job.total === 0 ? 0 : Math.min(1, job.processed / job.total)}"></span>
    </div>
  </div>
{/if}

<style>
  .progress-wrap {
    display: flex;
    align-items: center;
    /* UI-27 (AC-49): row stack — 8 px on the 4 px scale. */
    gap: 8px;
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
    width: 100%;
    background: var(--accent);
    /* D10 (AC-42): the shipped declaration transitioned `width` with
       `--duration-base` — a token defined in neither ramp, so it was invalid
       at computed-value time and the fill jumped. The progress rides a
       scaleX transform from the left edge, transitioned with a motion token
       that actually exists. At this bar height the scaled right cap is
       invisible. */
    transform: scaleX(var(--p, 0));
    transform-origin: left;
    transition: transform var(--duration-hover) var(--ease);
  }
</style>
