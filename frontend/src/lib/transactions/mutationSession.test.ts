import { describe, expect, it } from "vitest";
import {
  isSessionStillCurrent,
  isSubmittingThisSession,
} from "./mutationSession";

/**
 * TXN-FLOW-1 — Transaction Mutation Safety (F-4/F-5).
 *
 * Real behavioral unit tests for the two comparisons that are the entire
 * mutation-safety invariant: a same-tick re-entry guard (F-4, double-submit
 * protection) and a stale-session check (F-5, preventing an old async
 * result from controlling a newer form). TransactionsPage.tsx's own wiring
 * of these functions (captured session, guarded state clearing, etc.) is
 * separately verified by source-inspection in
 * TransactionsPage.mutationSafety.test.ts, matching this repo's no-RTL
 * convention.
 */

describe("isSubmittingThisSession (F-4: same-tick double-submit guard)", () => {
  it("nothing submitting yet (null): this session is not submitting", () => {
    expect(isSubmittingThisSession(null, 1)).toBe(false);
  });

  it("this exact session is already submitting: re-entry blocked", () => {
    expect(isSubmittingThisSession(1, 1)).toBe(true);
  });

  it("a DIFFERENT session is submitting (e.g. a still-pending older Form A): this (newer) session is NOT blocked", () => {
    // This is the key F-4 nuance: a per-session check, not a single shared
    // "is anything submitting" boolean — an independently-opened newer
    // form must be able to submit its own mutation even while an older
    // form's request is still in flight.
    expect(isSubmittingThisSession(1, 2)).toBe(false);
  });

  it("simulates two rapid clicks on the same session: first passes, second is blocked before any state update lands", () => {
    // Mirrors handleSubmit's actual guard shape: the ref is read and
    // written synchronously, before any awaited work — so a second call
    // arriving before React re-renders the disabled button still sees the
    // guard already set by the first.
    let submittingSessionRef: number | null = null;
    const currentSession = 5;

    // Click #1
    const click1Blocked = isSubmittingThisSession(
      submittingSessionRef,
      currentSession,
    );
    expect(click1Blocked).toBe(false); // allowed through
    submittingSessionRef = currentSession; // handleSubmit sets this synchronously

    // Click #2, same tick / before any await resolves
    const click2Blocked = isSubmittingThisSession(
      submittingSessionRef,
      currentSession,
    );
    expect(click2Blocked).toBe(true); // rejected/ignored

    // Mutation completes, guard releases
    submittingSessionRef = null;

    // Click #3 — retries must remain possible
    const click3Blocked = isSubmittingThisSession(
      submittingSessionRef,
      currentSession,
    );
    expect(click3Blocked).toBe(false);
  });
});

describe("isSessionStillCurrent (F-5: stale form-session detection)", () => {
  it("no newer form opened since submit: session is still current", () => {
    expect(isSessionStillCurrent(3, 3)).toBe(true);
  });

  it("a newer form opened since submit (session token advanced): stale", () => {
    expect(isSessionStillCurrent(3, 4)).toBe(false);
  });

  it("central F-5 regression scenario: Session A submits, Session B becomes current, A resolves as stale", () => {
    let currentSession = 1; // Form A open

    const submittedSessionA = currentSession; // A's handleSubmit captures its session
    expect(submittedSessionA).toBe(1);

    // User closes A, opens B — a NEW form session begins.
    currentSession = 2;

    // A's backend result now comes back.
    const aIsStillCurrent = isSessionStillCurrent(
      submittedSessionA,
      currentSession,
    );
    expect(aIsStillCurrent).toBe(false); // A must not close/reset/error into B

    // B's own submit, captured under session 2, completes normally.
    const submittedSessionB = currentSession;
    const bIsStillCurrent = isSessionStillCurrent(
      submittedSessionB,
      currentSession,
    );
    expect(bIsStillCurrent).toBe(true); // B's own completion may update B
  });
});
