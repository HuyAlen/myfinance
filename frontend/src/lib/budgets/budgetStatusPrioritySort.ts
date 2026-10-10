type BudgetUsage = { spent: number; limit: number };

/** Highest attention first: over limit, exactly at limit, under limit. */
export function sortBudgetCardsByStatusPriority<T>(
  items: readonly T[],
  getUsage: (item: T) => BudgetUsage,
): T[] {
  const getSortKey = ({ spent, limit }: BudgetUsage) => {
    const safeSpent = Number.isFinite(spent) ? spent : 0;
    const safeLimit = Number.isFinite(limit) ? limit : 0;
    if (safeLimit <= 0) return { rank: 3, ratio: 0, limit: safeLimit };
    const ratio = safeSpent / safeLimit;
    return {
      rank: safeSpent > safeLimit ? 0 : safeSpent === safeLimit ? 1 : 2,
      ratio,
      limit: safeLimit,
    };
  };
  return items
    .map((item, index) => ({ item, index, key: getSortKey(getUsage(item)) }))
    .sort((a, b) =>
      a.key.rank - b.key.rank ||
      (a.key.rank === 1
        ? b.key.limit - a.key.limit
        : b.key.ratio - a.key.ratio) ||
      b.key.limit - a.key.limit ||
      a.index - b.index,
    )
    .map(({ item }) => item);
}
