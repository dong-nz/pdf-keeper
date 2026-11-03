// Focus helpers (R4.4). Modal/menu focus trapping, initial focus and focus
// restoration are provided by the kit primitives inside the four wrapper
// components (DR-45); no manual trap exists here.

/** True when a key event arrives while the user is typing in a text target —
 *  global shortcuts MUST NOT fire there (§5.2 guard). */
export function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

/** SearchBox registers its focus function here; the global Ctrl+F handler
 *  calls it (UI-only state, never persisted). */
export const searchFocus: { register: () => void } = { register: () => {} };
