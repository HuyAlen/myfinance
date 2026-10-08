import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./InvestmentsPage.tsx', import.meta.url), 'utf8');
const normalized = source.replace(/\s+/g, ' ');

const accountCardsStart = source.indexOf('accountMetrics.map((account) => (');
const historyStart = source.indexOf('Lịch sử nạp/rút', accountCardsStart);
assert.ok(accountCardsStart >= 0 && historyStart > accountCardsStart, 'could not isolate Forex account cards');
const accountCards = source.slice(accountCardsStart, historyStart);

// FOREX-BALANCE-ASOF-1C semantic contract.
// Labels are intentionally Vietnamese; assert the finance meaning, not stale
// English wording from the earlier UI.
assert.match(accountCards, />\s*Số dư\s*</);
assert.match(accountCards, /label="Nạp trong kỳ"/);
assert.match(accountCards, /label="Rút trong kỳ"/);
assert.match(accountCards, /label="Lợi nhuận tại kỳ"/);
assert.doesNotMatch(accountCards, /label="Vốn ròng"/);
assert.doesNotMatch(accountCards, /label="Giá trị tài khoản"/);
assert.doesNotMatch(accountCards, /label="ROI"/);
assert.doesNotMatch(accountCards, /label="Phí"/);

assert.ok(normalized.includes('tradingProfitLoss: metric?.profitLoss ?? null,'));
assert.ok(normalized.includes('calculateForexPerformanceSnapshot(accounts, transactions)'));
assert.ok(normalized.includes('calculateForexPerformanceAsOf({'));
assert.ok(!normalized.includes('account.currentEquity - netCashFlow'));

assert.match(source, /label="Số dư ngoại hối"/);
assert.match(source, /label="Lợi nhuận ngoại hối"/);
assert.match(source, /label="Tổng giá trị hiện tại"/);
assert.match(source, /label="Danh mục đầu tư"/);
assert.doesNotMatch(source, /label="Nạp Forex"/);
assert.doesNotMatch(source, /label="Rút Forex"/);
assert.doesNotMatch(source, /label="Vốn ròng Forex"/);

const modalStart = source.indexOf('{accountModalOpen ? (');
const modalEnd = source.indexOf('{transactionModalOpen ? (', modalStart);
assert.ok(modalStart >= 0 && modalEnd > modalStart, 'could not isolate Forex account modal');
const modal = source.slice(modalStart, modalEnd);
assert.match(modal, /label="Số dư hiện tại \*"/);
assert.match(modal, /Lợi nhuận = Số dư - Tổng nạp \+ Tổng rút/);
assert.ok(!modal.includes('Equity hiện tại'));
assert.ok(!modal.includes('giá trị Equity'));
assert.ok(!modal.includes('số Equity'));
assert.doesNotMatch(modal, /ROI/);

assert.ok(source.includes('return "Số dư hiện tại phải là số không âm.";'));

console.log('INVESTMENTS-FOREX-EXNESS-BALANCE-1 contract PASS');