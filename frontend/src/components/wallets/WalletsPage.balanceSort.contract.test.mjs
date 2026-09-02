import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, 'WalletsPage.tsx'), 'utf8');

assert.match(
  source,
  /const sortedSpendableWallets = useMemo\([\s\S]*?\[\.\.\.spendableWallets\]\.sort\(\(a, b\) => b\.balance - a\.balance\)[\s\S]*?\[spendableWallets\][\s\S]*?\);/,
  'wallet list must derive a non-mutating balance-descending collection',
);
assert.ok(
  source.includes('{sortedSpendableWallets.map((wallet) => {'),
  'wallet cards must render the balance-descending collection',
);
assert.ok(
  !source.includes('{spendableWallets.map((wallet) => {'),
  'wallet cards must not render the unsorted spendable collection',
);

console.log('WALLET-BALANCE-SORT-1 contract PASS');
