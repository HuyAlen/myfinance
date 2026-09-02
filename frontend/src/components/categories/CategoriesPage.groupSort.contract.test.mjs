import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(__dirname, 'CategoriesPage.tsx'), 'utf8');
const normalized = source.replace(/\s+/g, ' ');

assert.match(source, /type SortOption = "amount" \| "usage" \| "name" \| "group";/);
assert.ok(source.includes('const GROUP_ORDER: CategoryGroup[] = ["income", "fixed", "variable"];'));
assert.ok(source.includes('const [sortBy, setSortBy] = useState<SortOption>("group");'));
assert.ok(source.includes('if (sortBy === "group") {'));
assert.ok(source.includes('GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)'));
assert.ok(source.includes('a.name.localeCompare(b.name, "vi")'));
assert.ok(source.includes('setSortBy("group");'));
assert.ok(normalized.includes('sortBy !== "group", ].filter(Boolean).length;'));
assert.equal((source.match(/\{ value: "group", label: "Loại danh mục" \}/g) ?? []).length, 2);

// Preservation guards for newer category fixes merged into the full replacement.
assert.ok(source.includes('const group = getCategoryPlanningGroup(category);'));
assert.ok(source.includes('data-dark-surface="category-stats"'));
assert.ok(source.includes('<MoreHorizontal size={16} />'));
assert.ok(source.includes('whitespace-nowrap text-[clamp(12px,3.6vw,14px)]'));
assert.ok(source.includes('mt-0.5 whitespace-nowrap text-xs font-black tabular-nums'));

const order = ['income', 'fixed', 'variable'];
const sample = [
  { group: 'variable', name: 'Ăn uống' },
  { group: 'income', name: 'Thưởng' },
  { group: 'fixed', name: 'Điện' },
  { group: 'income', name: 'Lương' },
  { group: 'fixed', name: 'Bảo hiểm' },
];
sample.sort((a, b) => {
  const groupOrder = order.indexOf(a.group) - order.indexOf(b.group);
  return groupOrder !== 0 ? groupOrder : a.name.localeCompare(b.name, 'vi');
});
assert.deepEqual(sample.map((item) => `${item.group}:${item.name}`), [
  'income:Lương',
  'income:Thưởng',
  'fixed:Bảo hiểm',
  'fixed:Điện',
  'variable:Ăn uống',
]);

console.log('CATEGORY-GROUP-SORT-1 contract PASS');
