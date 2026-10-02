import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "RealtimeProvider.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("WALLET-RECONCILIATION-CENTER-1 realtime contract", () => {
  it("declares wallet_reconciliations as a supported RealtimeTable", () => {
    expect(source).toContain('| "wallet_reconciliations"');
  });

  it("subscribes the global realtime channel to reconciliation receipts", () => {
    const start = source.indexOf("const tables: RealtimeTable[] = [");
    const end = source.indexOf("];", start);
    const region = source.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(region).toContain('"wallet_reconciliations"');
  });

  it("keeps callbacks routed through the same shared table listener map", () => {
    expect(source).toContain(
      "listenersRef.current.get(table)?.forEach((cb) => {",
    );
  });
});
