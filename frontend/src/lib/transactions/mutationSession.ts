/**
 * Transaction form mutation-safety primitives — TXN-FLOW-1.
 *
 * Pure, framework-free (no React, no Supabase) — safe to unit-test and
 * import from anywhere without pulling in the Transactions page's full
 * module graph (auth/realtime providers, which require env vars at import
 * time).
 *
 * TransactionsPage.tsx tracks two numbers for its Create/Edit modal:
 *   - a form-session id, bumped every time a NEW form is opened
 *     (Create or Edit) — never on Cancel/Close, since merely closing
 *     without opening something new isn't a new session and a
 *     still-in-flight submit for the just-closed form is safe to let
 *     finish normally;
 *   - a submitting-session id (or null), set to whichever session
 *     currently has a submit in flight.
 *
 * These two comparisons are the entire safety invariant:
 *   - `isSubmittingThisSession` — the same-tick re-entry guard checked at
 *     the top of handleSubmit. Session-scoped (not a single shared
 *     boolean) so a still-pending Form A submit never blocks an
 *     independently-opened Form B from submitting its own, unrelated
 *     mutation.
 *   - `isSessionStillCurrent` — checked after the backend result comes
 *     back, deciding whether this submit's own form-session is still the
 *     one displayed. If a NEWER form opened in the meantime, the result
 *     is stale: a genuine backend write is still reflected (the caller
 *     reloads regardless), but the stale submit must never close/reset
 *     the newer form or show a toast/error attributable to it.
 */

export function isSubmittingThisSession(
  submittingSession: number | null,
  currentSession: number,
): boolean {
  return submittingSession !== null && submittingSession === currentSession;
}

export function isSessionStillCurrent(
  submittedSession: number,
  currentSession: number,
): boolean {
  return submittedSession === currentSession;
}
