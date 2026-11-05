<script lang="ts">
  // Toast stack (UI-05): hand-written product chrome (DR-52). Errors stay
  // until dismissed or acted on; info toasts auto-dismiss (feedback store).
  import { feedback } from "$lib/state/feedback.svelte";
  import { t } from "$lib/i18n";
  import Icon from "./Icon.svelte";
</script>

<div class="toast-stack">
  {#each feedback.toasts as toast (toast.id)}
    <div class="toast" class:error={toast.kind === "error"} role={toast.kind === "error" ? "alert" : "status"}>
      <span class="toast-message">{toast.message}</span>
      {#if toast.action}
        <button
          class="control"
          onclick={() => {
            toast.action?.run();
            feedback.dismiss(toast.id);
          }}
        >
          {t(toast.action.labelKey)}
        </button>
      {/if}
      <button class="icon-button toast-close" aria-label={t("a11y.dismiss")} onclick={() => feedback.dismiss(toast.id)}>
        <Icon name="close" />
      </button>
    </div>
  {/each}
</div>

<style>
  .toast-stack {
    position: fixed;
    right: 16px;
    bottom: calc(var(--status-height) + 12px);
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 60;
    max-width: min(420px, calc(100vw - 32px));
    pointer-events: none;
  }

  .toast {
    pointer-events: auto;
    display: flex;
    /* UI-27 (AC-49): toast gap 10→8, vertical padding 10→12 — both on the
       4 px scale. */
    align-items: center;
    gap: 8px;
    padding: 12px;
    background: var(--surface-1);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-modal);
    box-shadow: var(--shadow-overlay);
    font-size: var(--text-13);
    animation: toast-in var(--duration-toast) var(--ease);
  }

  .toast.error {
    border-color: var(--danger);
  }

  .toast-message {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .toast-close {
    width: 24px;
    height: 24px;
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
</style>
