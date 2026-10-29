// Savings activity is an audit trail: pagination must affect presentation only.
// Fetch in bounded pages so the Supabase/PostgREST default row cap cannot
// silently truncate historical savings movements or analytics totals.

export const SAVINGS_ACTIVITY_PAGE_SIZE = 6;
export const SAVINGS_LEDGER_BATCH_SIZE = 500;

type SavingsLedgerPage<T> = {
  data: T[] | null;
  error: { message?: string } | null;
};

export async function loadCompleteSavingsLedger<T extends { id: string }>(
  fetchPage: (from: number, to: number) => Promise<SavingsLedgerPage<T>>,
  batchSize = SAVINGS_LEDGER_BATCH_SIZE,
): Promise<T[]> {
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
    throw new Error("Invalid savings ledger batch size");
  }

  const rows: T[] = [];
  const seenIds = new Set<string>();
  let offset = 0;

  while (true) {
    const { data, error } = await fetchPage(offset, offset + batchSize - 1);
    if (error) {
      throw new Error(error.message || "Could not load savings transactions");
    }
    if (data === null) {
      throw new Error("Savings transactions response was not available");
    }

    // A concurrent insert can shift a subsequent offset page. Never show the
    // same ledger entry twice; realtime refresh will reconcile new entries.
    for (const row of data) {
      if (!seenIds.has(row.id)) {
        seenIds.add(row.id);
        rows.push(row);
      }
    }

    if (data.length < batchSize) return rows;
    offset += data.length;
  }
}

export function paginateSavingsActivity<T>(
  rows: readonly T[],
  requestedPage: number,
  pageSize = SAVINGS_ACTIVITY_PAGE_SIZE,
) {
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0) {
    throw new Error("Invalid savings activity page size");
  }

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Number.isFinite(requestedPage)
    ? Math.trunc(requestedPage)
    : 1;
  const page = Math.max(1, Math.min(pageCount, safePage));
  const offset = (page - 1) * pageSize;
  const items = rows.slice(offset, offset + pageSize);

  return {
    items,
    page,
    pageCount,
    total,
    from: total === 0 ? 0 : offset + 1,
    to: offset + items.length,
  };
}
