import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./BudgetsPage.tsx', import.meta.url), 'utf8');

assert.match(
  source,
  /\[\.\.\.periodBudgetRollups\]\s*\.sort\(\(a, b\) => \{/,
  'allocation must sort a copy of periodBudgetRollups',
);
assert.match(
  source,
  /const limitDiff = b\.limit - a\.limit/,
  'allocation must sort budget limits descending',
);
assert.match(
  source,
  /if \(limitDiff !== 0\) return limitDiff/,
  'descending budget limit must be the primary allocation order',
);
assert.match(
  source,
  /return nameA\.localeCompare\(nameB, "vi"\)/,
  'equal limits need a deterministic Vietnamese-name tie-break',
);
assert.match(
  source,
  /\.map\(\(rollup, index\) => \(\{[\s\S]*?color: PIE_COLORS\[index % PIE_COLORS\.length\]/,
  'colors must be assigned after sorting so chart and legend stay aligned',
);
assert.doesNotMatch(
  source,
  /periodBudgetRollups\.sort\(/,
  'allocation sort must not mutate periodBudgetRollups',
);

console.log('BUDGET-ALLOCATION-SORT-1 contract PASS');
