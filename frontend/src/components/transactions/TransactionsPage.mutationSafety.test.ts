import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TXN-FLOW-1 — Transaction Mutation Safety (F-4/F-5).
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md). The core comparison logic
 * (isSubmittingThisSession/isSessionStillCurrent) has real behavioral
 * tests in src/lib/transactions/mutationSession.test.ts; these tests prove
 * TransactionsPage.tsx actually wires that logic in correctly, at the
 * right points, in the right order.
 */
describe("TransactionsPage form-session mutation safety wiring (TXN-FLOW-1)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  );
  const normalized = source.replace(/\s+/g, " ");

  it("imports the shared mutation-session comparisons rather than reimplementing them inline", () => {
    expect(source).toContain(
      '} from "@/src/lib/transactions/mutationSession";',
    );
    expect(source).toContain("isSessionStillCurrent");
    expect(source).toContain("isSubmittingThisSession");
  });

  it("beginNewFormSession bumps both the ref and the mirrored render state together", () => {
    const start = source.indexOf("function beginNewFormSession() {");
    const end = source.indexOf("}", start);
    expect(start).toBeGreaterThan(-1);
    const fnSource = source.slice(start, end);

    expect(fnSource).toContain("formSessionRef.current = next;");
    expect(fnSource).toContain("setFormSessionState(next);");
  });

  it("both openCreateForm and openEditForm begin a new form session (F-5's session-token bump)", () => {
    const createStart = source.indexOf("function openCreateForm() {");
    const createEnd = source.indexOf("useQuickActionCreateIntent(openCreateForm);");
    expect(createStart).toBeGreaterThan(-1);
    expect(createEnd).toBeGreaterThan(createStart);
    expect(source.slice(createStart, createEnd)).toContain(
      "beginNewFormSession();",
    );

    const editStart = source.indexOf("function openEditForm(t: Transaction) {");
    const editEnd = source.indexOf("function handleTypeChange(");
    expect(editStart).toBeGreaterThan(-1);
    expect(editEnd).toBeGreaterThan(editStart);
    expect(source.slice(editStart, editEnd)).toContain(
      "beginNewFormSession();",
    );
  });

  it("handleSubmit checks the same-tick re-entry guard before any validation or await", () => {
    const start = source.indexOf(
      "async function handleSubmit(event: React.FormEvent) {",
    );
    expect(start).toBeGreaterThan(-1);
    const guardIdx = source.indexOf(
      "isSubmittingThisSession(submittingSessionRef.current, formSessionRef.current)",
      start,
    );
    const amountIdx = source.indexOf("const amount = Number(form.amount);", start);
    expect(guardIdx).toBeGreaterThan(start);
    expect(amountIdx).toBeGreaterThan(guardIdx);
  });

  it("handleSubmit captures its session and marks itself submitting before the first backend await", () => {
    const start = source.indexOf(
      "async function handleSubmit(event: React.FormEvent) {",
    );
    const tryIdx = source.indexOf("try {", start);
    const captureIdx = source.indexOf(
      "const submittedSession = formSessionRef.current;",
      start,
    );
    const markIdx = source.indexOf(
      "submittingSessionRef.current = submittedSession;",
      start,
    );
    const firstAwaitIdx = source.indexOf(
      "await replaceTransferWalletBalance(",
      start,
    );

    expect(captureIdx).toBeGreaterThan(start);
    expect(captureIdx).toBeLessThan(tryIdx);
    expect(markIdx).toBeGreaterThan(captureIdx);
    expect(markIdx).toBeLessThan(tryIdx);
    expect(firstAwaitIdx).toBeGreaterThan(tryIdx);
  });

  it("every session-local UI update after an await (error/success) is gated by isSessionStillCurrent, with a stale branch that never touches saveError/toast/form state", () => {
    const start = source.indexOf(
      "async function handleSubmit(event: React.FormEvent) {",
    );
    const end = source.indexOf("} finally {", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const fnSource = source.slice(start, end);

    const occurrences =
      fnSource.split("isSessionStillCurrent(submittedSession, formSessionRef.current)")
        .length - 1;
    // Balance-error branch, write-error branch, and the post-reload
    // success branch — three independent checkpoints.
    expect(occurrences).toBe(3);

    // The success path must reload BEFORE checking staleness — a genuine
    // backend write is real regardless of which form is open now.
    const reloadIdx = fnSource.indexOf("await runReload();");
    const successStaleCheckIdx = fnSource.indexOf(
      "if (!isSessionStillCurrent(submittedSession, formSessionRef.current)) {",
    );
    expect(reloadIdx).toBeGreaterThan(-1);
    expect(successStaleCheckIdx).toBeGreaterThan(reloadIdx);
  });

  it("the finally block only releases the in-flight guard if it still belongs to this submit (a stale completion cannot clear a newer session's own in-flight flag)", () => {
    const start = source.indexOf(
      "async function handleSubmit(event: React.FormEvent) {",
    );
    const finallyIdx = source.indexOf("} finally {", start);
    const end = source.indexOf("\n  }\n\n  function handleDelete(", finallyIdx);
    expect(finallyIdx).toBeGreaterThan(start);
    expect(end).toBeGreaterThan(finallyIdx);
    const finallySource = source.slice(finallyIdx, end);

    expect(finallySource).toContain(
      "if (submittingSessionRef.current === submittedSession) {",
    );
    expect(finallySource).toContain("submittingSessionRef.current = null;");
    expect(finallySource).toContain("setSubmittingSessionState(null);");
  });

  it("stale failures are logged (not silently dropped) instead of being surfaced as the current form's error", () => {
    expect(normalized).toContain(
      'console.error("[TransactionsPage] stale submit failed:", error);',
    );
  });

  it("the Save button is disabled and shows a loading label while isSubmitting, without disabling Cancel/Close (Model B: closing is safe because the session token already protects a newer form)", () => {
    const modalStart = source.indexOf("{/* ── CRUD Form Modal");
    expect(modalStart).toBeGreaterThan(-1);
    const modalSource = source.slice(modalStart);

    expect(modalSource).toContain("disabled={isSubmitting}");
    expect(normalized).toContain('{isSubmitting ? "Đang lưu..."');

    // Exactly one disabled={isSubmitting} — the Save button only; Cancel/
    // Close remain clickable while a submit is in flight.
    const occurrences = modalSource.split("disabled={isSubmitting}").length - 1;
    expect(occurrences).toBe(1);
  });

  it("no useEffect was added to synchronize the mutation booleans — they are set/read directly inside handlers", () => {
    const start = source.indexOf("const formSessionRef = useRef(0);");
    const end = source.indexOf("function beginNewFormSession() {");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(source.slice(start, end)).not.toContain("useEffect");
  });

  it("does not add a new getWallets/getCategories/getTransactionsInRange/addTransaction/updateTransaction call site — mutation safety reuses the existing single call sites", () => {
    for (const fn of [
      "addTransaction(",
      "updateTransaction(",
      "getTransactionsInRange(",
    ]) {
      const occurrences = source.split(fn).length - 1;
      expect(occurrences).toBe(1);
    }
  });
});
