import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./BudgetsPage.tsx', import.meta.url), 'utf8');

assert.match(source, /const sortedDisplayBudgets = useMemo\(/, 'missing sortedDisplayBudgets');
assert.match(source, /const spentA = a\.periodSpent \?\? getSpent\(a\)/, 'missing canonical spentA');
assert.match(source, /const spentB = b\.periodSpent \?\? getSpent\(b\)/, 'missing canonical spentB');
assert.match(source, /return spentB - spentA/, 'missing descending comparator');
assert.match(source, /\{sortedDisplayBudgets\.map\(\(budget\) => \{/, 'cards are not rendered from sorted list');
assert.doesNotMatch(source, /\{displayBudgets\.map\(\(budget\) => \{/, 'unsorted card render still present');
assert.match(source, /\[\.\.\.displayBudgets\]\.sort\(/, 'sort must not mutate displayBudgets');

console.log('BUDGET-SPEND-SORT-1 contract PASS');
