import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const MJS_CONTRACTS = [
  "src/components/budgets/BudgetsPage.allocationColumnMajor.contract.test.mjs",
  "src/components/budgets/BudgetsPage.allocationSort.contract.test.mjs",
  "src/components/budgets/BudgetsPage.spendSort.contract.test.mjs",
  "src/components/categories/CategoriesPage.groupSort.contract.test.mjs",
  "src/components/investments/InvestmentsPage.exnessBalance.contract.test.mjs",
  "src/components/investments/InvestmentsPage.uiPolish2.contract.test.mjs",
  "src/components/layout/Sidebar.scrollRetention.contract.test.mjs",
  "src/components/wallets/WalletsPage.balanceSort.contract.test.mjs",
];

function runNode(relativePath) {
  const result = spawnSync(process.execPath, [relativePath], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Contract ${relativePath} failed with exit code ${String(result.status)}`,
    );
  }
}

export function runMjsContracts() {
  console.log(`\n[release-gate] MJS contracts (${MJS_CONTRACTS.length})`);
  for (const relativePath of MJS_CONTRACTS) {
    console.log(`[release-gate] node ${relativePath}`);
    runNode(relativePath);
  }
}

const invokedPath = process.argv[1]
  ? path.resolve(process.argv[1])
  : "";
const currentPath = fileURLToPath(import.meta.url);

if (invokedPath === currentPath) {
  runMjsContracts();
}