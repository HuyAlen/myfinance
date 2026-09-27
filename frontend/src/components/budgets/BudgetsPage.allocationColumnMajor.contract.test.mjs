import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./BudgetsPage.tsx', import.meta.url), 'utf8');

assert.match(
  source,
  /const allocationColumns = useMemo\(\(\) => \{[\s\S]*?Math\.ceil\(pieData\.length \/ 2\)/,
  'desktop allocation must split the already-ranked pieData into balanced columns',
);
assert.match(
  source,
  /pieData\.slice\(0, splitIndex\), pieData\.slice\(splitIndex\)/,
  'left column must receive the first/highest-ranked items and right column the remainder',
);
assert.match(
  source,
  /allocationColumns\.map\(\(column, columnIndex\) => \([\s\S]*?column\.map\(\(item\) => \(/,
  'desktop legend must render each column vertically instead of row-major grid placement',
);
assert.match(
  source,
  /className="space-y-2 md:hidden"[\s\S]*?pieData\.map\(\(item\) => \(/,
  'mobile must remain one continuous descending list',
);
assert.match(
  source,
  /className="hidden gap-x-8 md:grid md:grid-cols-2"/,
  'two-column column-major layout must apply from md upward',
);

console.log('BUDGET-ALLOCATION-COLUMN-MAJOR-1 contract PASS');
