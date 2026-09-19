import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./InvestmentsPage.tsx', import.meta.url), 'utf8');

const summaryStart = source.indexOf('<section className="space-y-4 sm:space-y-5">');
const portfolioStart = source.indexOf('Danh mục đầu tư', summaryStart);
assert.ok(summaryStart >= 0 && portfolioStart > summaryStart, 'could not isolate investment summary');
const summary = source.slice(summaryStart, portfolioStart);

const summaryCardCount = (summary.match(/<SummaryCard/g) ?? []).length;
assert.equal(summaryCardCount, 4, 'top summary must contain exactly four KPI cards');
assert.match(summary, /label="Tổng giá trị đầu tư"/);
assert.match(summary, /label="Portfolio"/);
assert.match(summary, /label="Balance Forex"/);
assert.match(summary, /label="Profit Forex"/);
assert.doesNotMatch(summary, /label="Nạp Forex"/);
assert.doesNotMatch(summary, /label="Rút Forex"/);
assert.doesNotMatch(summary, /label="Lời \/ lỗ Portfolio"/);
assert.doesNotMatch(summary, /Balance - Nạp \+ Rút/);
assert.match(summary, /tài khoản hiện tại|có Balance/);

assert.match(source, /data-ui="portfolio-empty-compact"/);
assert.doesNotMatch(source, /data-ui="portfolio-empty-compact"[^>]*min-h-48/);

const forexStart = source.indexOf('data-ui="forex-workstation"');
const historyStart = source.indexOf('data-ui="forex-history-workstation"', forexStart);
assert.ok(forexStart >= 0 && historyStart > forexStart, 'could not isolate Forex workstation');
const forex = source.slice(forexStart, historyStart);
assert.match(forex, />\s*Tài khoản Forex\s*</);
assert.match(forex, /data-ui="forex-account-workstation"/);
assert.doesNotMatch(forex, /lg:grid-cols-2/);
assert.match(forex, /Cập nhật Balance/);
assert.match(forex, /grid-cols-\[minmax\(0,1\.35fr\)_repeat\(3,minmax\(0,1fr\)\)\]/);

const history = source.slice(historyStart);
assert.match(history, />Loại</);
assert.match(history, />Tài khoản \/ Ví</);
assert.match(history, />Thời gian</);
assert.match(history, />Số tiền</);

console.log('INVESTMENTS-UI-POLISH-2 contract PASS');
