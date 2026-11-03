// Feedback store (spec §5.3.4): the toast queue and the active job
// progress — the only place command rejections become user-facing
// (R4.6), the only subscriber surface for job events (via library's
// event wiring). No library data lives here.

import type { AppErrorPayload, JobProgress } from "../types";
import { t, tp, type MsgKey, type MsgParams, type PluralBase } from "../i18n";

export interface ToastAction {
  labelKey: MsgKey;
  run: () => void;
}

export interface Toast {
  id: number;
  /** Error toasts carry a resolved message; notification toasts resolve a
   *  catalog key (+ optional plural count) at notify time. */
  message: string;
  kind: "info" | "error";
  action?: ToastAction;
  /** Error details kept for the retry action of file-delete failures. */
  detail?: AppErrorPayload;
}

class FeedbackStore {
  toasts = $state<Toast[]>([]);
  job = $state<JobProgress | null>(null);
  /** Relink dialog target, set by the missing-file toast action. */
  relinkTargetId = $state<number | null>(null);
  /** Open overlays (modals, menus). The global Esc handler only acts when
   *  this is 0 — an open overlay consumes Escape first (§5.2).
   *  Deliberately NOT `$state`: the only reader is App's keydown handler
   *  (imperative). As `$state` it entangles with the registration effects
   *  that call beginOverlay — the read+write inside the effect re-triggers
   *  it forever (observed in v0.0.1 verification: thousands of begin/end
   *  cycles per open overlay, the count oscillating, and Esc reads landing
   *  on 0 while an overlay was open). */
  overlayCount = 0;

  #nextId = 1;
  #timers = new Map<number, number>();

  beginOverlay(): () => void {
    this.overlayCount++;
    // The decrement is deferred past the current task: an overlay that
    // unmounts during a keydown dispatch must not make that same
    // dispatch's Escape look like "no overlay" (§5.2, pinned by
    // state/feedback.test.ts). Not a complete signal on its own — a
    // dialog's close chain can drain microtasks before App's window-level
    // listener runs, so App also honors event.defaultPrevented.
    return () => queueMicrotask(() => this.overlayCount--);
  }

  notify(key: MsgKey | PluralBase, count?: number): void {
    const message = count === undefined ? t(key as MsgKey) : tp(key as PluralBase, count);
    this.#push({ message, kind: "info" });
  }

  reportError(payload: AppErrorPayload, action?: ToastAction): void {
    this.#push({ message: describeError(payload), kind: "error", action, detail: payload });
  }

  openRelink(documentId: number): void {
    this.relinkTargetId = documentId;
  }

  closeRelink(): void {
    this.relinkTargetId = null;
  }

  jobProgress(progress: JobProgress): void {
    this.job = progress.processed >= progress.total ? null : progress;
  }

  dismiss(id: number): void {
    this.toasts = this.toasts.filter((toast) => toast.id !== id);
    const timer = this.#timers.get(id);
    clearTimeout(timer);
    this.#timers.delete(id);
  }

  #push(toast: Omit<Toast, "id">): void {
    const id = this.#nextId++;
    this.toasts = [...this.toasts, { id, ...toast }];
    // Info toasts auto-dismiss; error toasts stay until acted on or
    // dismissed (UI-05 / status-feedback.md).
    if (toast.kind === "info") {
      this.#timers.set(id, setTimeout(() => this.dismiss(id), 6000));
    }
  }
}

function describeError(payload: AppErrorPayload): string {
  switch (payload.kind) {
    case "missing_file":
      return t("error.missingFile", { path: payload.message });
    case "document_not_found":
      return t("error.documentGone");
    case "category_not_found":
      return t("error.categoryGone");
    case "category_duplicate":
      return t("error.categoryDuplicate");
    case "open_failed":
      return t("error.openFailed");
    case "io":
      return t("error.io", { path: payload.message });
    default:
      return payload.message || t("error.internal");
  }
}

export const feedback = new FeedbackStore();
export type { AppErrorPayload, MsgParams };
