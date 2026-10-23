# MYFINANCE Dashboard Visual Redesign P1.1
Date: 2026-10-23

## Observed user feedback
The October 23 1728px screenshot shows four chart cards that are not visually compelling. Donut fills only the upper part of its card; budget has five identical saturated bars despite 446% vs 101%; wallet duplicates budget's row/bar style; cash-flow appears like a default library example.

## Decision
Ship a real layout redesign on the existing Professional Polish P1 feature branch, not another round of borders/color tweaks. The screenshot and prior instructions establish visual-first/less-text, soft-blue, modern fintech, mobile usability, and no fabricated finance values.

## Four distinct visual grammars
1. Cash-flow: retained honest shared-axis grouped columns + net line, but refined chart header and inline data summary/legend, less visual noise. Do not reinterpret cumulative netCashMovement or sum it blindly.
2. Expenses: replace donut/legend with **proportional mosaic treemap**; rectangles reflect real category values by their area, top rows visually fill the card. Amount total is explicit. Long-tail is rolled into "Danh mục khác" without losing value.
3. Budget: replace all-full progress strips with **shared-scale bullet bars** with a clear 100% allocation marker and coral overage segments; a 446% spend genuinely draws ~4x as long as 110%. Keep exact percent and spent/limit, handle zero limit explicitly.
4. Wallet: replace another stack of skinny progress rows with **one proportionally stacked liquidity band** and simple legend of wallet balances/share, sum across all positive wallets. Report excluded negative wallet count.

## Non-goals
Do not touch Supabase, financial formula services, page routes, global app chrome or all existing dashboard detailed sections. No external libraries. Respect Vietnamese copy and light/dark themes. Do not merge until full QA passes.

## Quality gates
Unit tests for mosaic geometry, zero/single categories, shared budget scale, 0-limit rows, wallet long-tail conservation; existing Chart First / cash flow / iPhone scroll / Vietnamese route tests; TypeScript, ESLint, full Vitest and production build in GitHub Actions.

## Development approach
Evolve the existing PR #8 feature branch; it includes Chart First P1 and P1 polish. Preserve current canonical input props and readiness flags. No additional route hooks or scroll owners.
