# MYFINANCE-RELEASE-GATE-1

## Scope

GitHub Actions quality gate for `frontend/` (the actual Next.js app): locked npm dependencies, TypeScript, ESLint, all Vitest unit/contract tests, and production compilation. The backend directory is a placeholder, not a deployable API, and is intentionally not used.

## CI behavior

- Workflow: `.github/workflows/myfinance-quality-gate.yml`.
- Runs for pull requests targeting `main`, pushes to `main`, and manual dispatch.
- Node 24; `npm ci` reads `frontend/package-lock.json`.
- Only read-only GitHub permissions; no Vercel or Supabase secrets.
- Build receives fake **CI-only** Supabase URL and anon key to satisfy module evaluation, not to test a live database. Never repurpose CI values for production.
- `npm run build` verifies compilation; **not** production database, auth, or deployment health.
- Uses SHA-pinned official checkout/setup-node actions and disables persisted checkout credentials.
- CI does not deploy or run migrations. Vercel remains managed by the existing Git integration.

## Set up required status checks (repository administrator)

This repository currently has no protected default branch. Publishing the YAML alone **does not protect main**. Configure **after the first successful PR CI run**:

1. Open GitHub > `HuyAlen/myfinance` > Settings > Rules > Rulesets (or Settings > Branches > Branch protection rules, depending on GitHub UI).
2. Create an active branch ruleset targeting `main`.
3. Require a pull request before merging; do not allow force-push or deletion.
4. Require status checks to pass, select the check named **Quality Gate** from the **MyFinance Quality Gate** workflow. Enable *Require branches to be up to date* if practical.
5. Do not grant general bypass. Verify a test PR cannot merge while the check is failing or pending.
6. Use merge or fast-forward through an approved PR after checks turn green; don't push directly to `main` from PowerShell.

Repository ruleset/branch protection API is not configured by this change and must be verified separately by an administrator.

## Developer verification on Windows

```powershell
Set-Location 'D:\Projects\personal-finance\frontend'
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { throw 'TypeScript failed' }
npm run lint
if ($LASTEXITCODE -ne 0) { throw 'ESLint failed' }
npm run test
if ($LASTEXITCODE -ne 0) { throw 'Vitest failed' }

# Build has the same CI-only placeholders if your local env is absent.
# Do not overwrite working production/development .env files.
$priorUrl = $env:NEXT_PUBLIC_SUPABASE_URL
$priorKey = $env:NEXT_PUBLIC_SUPABASE_ANON_KEY
try {
    if (-not $priorUrl) { $env:NEXT_PUBLIC_SUPABASE_URL = 'https://ci-placeholder.supabase.co' }
    if (-not $priorKey) { $env:NEXT_PUBLIC_SUPABASE_ANON_KEY = 'ci-placeholder-not-a-real-api-key' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Next.js build failed' }
} finally {
    $env:NEXT_PUBLIC_SUPABASE_URL = $priorUrl
    $env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $priorKey
}
```

## Scope boundaries

This CI gate does NOT confirm: live Supabase schema/RLS/RPC grants, wallet and ledger reconciliation in production, iPhone Safari UX, backup restore, or a production deployment. Those require separate verification tasks. If baseline lint/build fails, fix those failures on a feature branch before enabling a strict required status check, rather than bypassing the gate.
