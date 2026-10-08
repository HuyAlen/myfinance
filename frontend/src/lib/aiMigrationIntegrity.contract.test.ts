import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(frontendRoot, "..");

function readRepo(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8").replace(
    /\r\n/g,
    "\n",
  );
}

const ai22 = readRepo("frontend/supabase/ai-2.2-pending-actions.sql");
const ai23 = readRepo(
  "frontend/supabase/ai-2.3-pending-action-hardening.sql",
);
const byok = readRepo("frontend/supabase/ai-byok-1.6.sql");
const schema = readRepo("supabase/schema.sql");
const verification = readRepo("supabase/schema-verification.sql");
const setupDocs = readRepo("docs/SUPABASE_SETUP.md");
const pendingRepository = readRepo(
  "frontend/src/services/finance/ai-agent/server/aiPendingActionRepository.server.ts",
);
const executor = readRepo(
  "frontend/src/services/finance/ai-agent/server/aiWriteActionExecutor.server.ts",
);
const settingsRepository = readRepo(
  "frontend/src/services/finance/ai-agent/server/aiSettingsRepository.ts",
);

describe("AI-MIGRATION-INTEGRITY-1 — P1", () => {
  it("replaces all three empty migration placeholders with reviewed forward migrations", () => {
    for (const migration of [ai22, ai23, byok]) {
      expect(migration.trim().length).toBeGreaterThan(500);
      expect(migration).not.toMatch(/^\s*$/);
    }
  });

  it("reconstructs AI 2.2 persistent conversation, action-audit and usage tables", () => {
    for (const table of [
      "ai_conversations",
      "ai_messages",
      "ai_pending_actions",
      "ai_action_audit_logs",
      "ai_usage_logs",
    ]) {
      expect(ai22).toContain(`public.${table}`);
      expect(ai22).toContain(
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`,
      );
    }

    expect(ai22).toContain("idx_ai_conversations_user_last_message");
    expect(ai22).toContain("idx_ai_messages_conversation_created");
    expect(ai22).toContain("idx_ai_pending_actions_user_conversation");
    expect(ai22).toContain("idx_ai_action_audit_user_created");
    expect(ai22).toContain("idx_ai_usage_user_created");
    expect(ai22).toContain("auth.uid() = user_id");
    expect(ai22).toContain("c.user_id = auth.uid()");
  });

  it("puts pending-action CAS/idempotency hardening in AI 2.3", () => {
    expect(ai23).toContain("ADD COLUMN IF NOT EXISTS idempotency_key text");
    expect(ai23).toContain("ADD COLUMN IF NOT EXISTS confirmed_by uuid");
    expect(ai23).toContain("'executing'");
    expect(ai23).toContain("ai_pending_actions_idempotency_key");
    expect(ai23).toContain("UNIQUE (user_id, idempotency_key)");
    expect(ai23).toContain("idx_ai_pending_actions_status_expires");
    expect(ai23).toContain(
      "AI-2.3 requires public.ai_pending_actions from AI-2.2",
    );
  });

  it("reconstructs BYOK 1.6 without destructively rewriting legacy plaintext keys", () => {
    for (const column of [
      "encrypted_api_key",
      "api_key_iv",
      "api_key_auth_tag",
      "api_key_hint",
      "connection_status",
      "last_tested_at",
      "last_test_latency_ms",
      "last_test_error",
    ]) {
      expect(byok).toContain(column);
    }

    expect(byok).toContain("CREATE TABLE IF NOT EXISTS public.ai_user_settings");
    expect(byok).toContain("GRANT SELECT, INSERT, UPDATE");
    expect(byok).not.toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_user_settings",
    );
    expect(byok).not.toMatch(/UPDATE\s+public\.ai_user_settings\s+SET\s+api_key/i);
    expect(byok).toContain("Legacy plaintext provider key");
  });

  it("keeps the canonical schema aligned with current pending-action runtime writes", () => {
    const pendingStart = schema.indexOf(
      "CREATE TABLE IF NOT EXISTS public.ai_pending_actions",
    );
    const auditStart = schema.indexOf(
      "CREATE TABLE IF NOT EXISTS public.ai_action_audit_logs",
      pendingStart,
    );
    expect(pendingStart).toBeGreaterThan(-1);
    expect(auditStart).toBeGreaterThan(pendingStart);

    const pendingSchema = schema.slice(pendingStart, auditStart);
    expect(pendingSchema).toContain("idempotency_key text");
    expect(pendingSchema).toContain("confirmed_at");
    expect(pendingSchema).toContain("confirmed_by");
    expect(pendingSchema).toContain("executed_at");
    expect(pendingSchema).toContain("'executing'");
    expect(pendingSchema).toContain(
      "CONSTRAINT ai_pending_actions_idempotency_key UNIQUE (user_id, idempotency_key)",
    );
  });

  it("backs every migration-critical field used by the server repositories", () => {
    expect(pendingRepository).toContain('.eq("idempotency_key", idempotencyKey)');
    expect(pendingRepository).toContain('.eq("status", input.expectedStatus)');
    expect(executor).toContain('status: "executing"');
    expect(executor).toContain("confirmed_by: input.context.userId");
    expect(executor).toContain("executed_at:");
    expect(executor).toContain("recordAIActionAudit");

    expect(settingsRepository).toContain("payload.encrypted_api_key");
    expect(settingsRepository).toContain("payload.api_key_iv");
    expect(settingsRepository).toContain("payload.api_key_auth_tag");
    expect(settingsRepository).toContain("payload.api_key_hint");
    expect(settingsRepository).toContain("payload.api_key = null");
  });

  it("adds an operator-visible verification for the AI runtime schema contract", () => {
    expect(verification).toContain("AI-MIGRATION-INTEGRITY-1");
    expect(verification).toContain("pending_has_confirmed_by");
    expect(verification).toContain("pending_has_idempotency_key");
    expect(verification).toContain("settings_has_encrypted_key_payload");
  });

  it("documents the server-only BYOK encryption secret required by runtime", () => {
    const normalizedDocs = setupDocs.toLowerCase();
    expect(normalizedDocs).toContain("ai_settings_encryption_key");
    expect(normalizedDocs).toContain("64-character hexadecimal");
    expect(normalizedDocs).toContain("server-only");
  });
});
