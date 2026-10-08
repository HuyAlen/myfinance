import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runMjsContracts } from "./run-mjs-contracts.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(scriptDir, "..");

const NODE_STAGES = [
  {
    name: "Environment preflight",
    executable: "scripts/validate-env.mjs",
    args: ["--mode=production"],
  },
  {
    name: "TypeScript",
    executable: "node_modules/typescript/bin/tsc",
    args: ["--noEmit"],
  },
  {
    name: "ESLint",
    executable: "node_modules/eslint/bin/eslint.js",
    args: ["."],
  },
  {
    name: "Vitest",
    executable: "node_modules/vitest/vitest.mjs",
    args: ["run"],
  },
];

const NEXT_BUILD_STAGE = {
  name: "Next build",
  executable: "node_modules/next/dist/bin/next",
  args: ["build"],
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: frontendDir,
    env: process.env,
    stdio: "inherit",
    ...options,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${String(result.status)}`,
    );
  }
}

function runGitDiffCheck(label) {
  console.log(`\n[release-gate] ${label}`);
  run("git", ["diff", "--check"]);
}

function runNodeStage(stage) {
  console.log(`\n[release-gate] ${stage.name}`);
  run(process.execPath, [stage.executable, ...stage.args]);
}

console.log("[release-gate] MYFINANCE-RELEASE-GATE-1");
runGitDiffCheck("git diff --check (before)");

for (const stage of NODE_STAGES) {
  runNodeStage(stage);
}

runMjsContracts();

runNodeStage(NEXT_BUILD_STAGE);
runGitDiffCheck("git diff --check (after)");

console.log("\n[release-gate] PASS");