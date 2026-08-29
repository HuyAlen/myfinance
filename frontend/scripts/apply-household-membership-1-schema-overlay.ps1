$ErrorActionPreference = "Stop"

$frontendRoot = Split-Path $PSScriptRoot -Parent
$repoRoot = Split-Path $frontendRoot -Parent
$migrationPath = Join-Path $frontendRoot "supabase\household-membership-1-single-active-household.sql"
$schemaPath = Join-Path $repoRoot "supabase\schema.sql"

if (-not (Test-Path $migrationPath)) {
    throw "Migration not found: $migrationPath"
}
if (-not (Test-Path $schemaPath)) {
    throw "Canonical schema not found: $schemaPath"
}

$utf8 = [System.Text.Encoding]::UTF8
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$migration = [System.IO.File]::ReadAllText($migrationPath, $utf8)
$schema = [System.IO.File]::ReadAllText($schemaPath, $utf8)

$sharedStart = "-- BEGIN HOUSEHOLD-MEMBERSHIP-1 SHARED BODY"
$sharedEnd = "-- END HOUSEHOLD-MEMBERSHIP-1 SHARED BODY"
$overlayStart = "-- BEGIN HOUSEHOLD-MEMBERSHIP-1 CANONICAL OVERLAY"
$overlayEnd = "-- END HOUSEHOLD-MEMBERSHIP-1 CANONICAL OVERLAY"

$startIndex = $migration.IndexOf($sharedStart)
$endIndex = $migration.IndexOf($sharedEnd, $startIndex + $sharedStart.Length)
if ($startIndex -lt 0 -or $endIndex -le $startIndex) {
    throw "HOUSEHOLD-MEMBERSHIP-1 shared body markers are missing from migration."
}

$bodyStart = $startIndex + $sharedStart.Length
$body = $migration.Substring($bodyStart, $endIndex - $bodyStart).Trim()
$overlay = "$overlayStart`r`n$body`r`n$overlayEnd"

$existingStart = $schema.IndexOf($overlayStart)
if ($existingStart -ge 0) {
    $existingEnd = $schema.IndexOf($overlayEnd, $existingStart + $overlayStart.Length)
    if ($existingEnd -lt 0) {
        throw "Canonical schema contains an incomplete HOUSEHOLD-MEMBERSHIP-1 overlay."
    }
    $existingEnd += $overlayEnd.Length
    $schema = $schema.Substring(0, $existingStart).TrimEnd() + "`r`n`r`n" + $overlay + $schema.Substring($existingEnd)
} else {
    $schema = $schema.TrimEnd() + "`r`n`r`n" + $overlay + "`r`n"
}

[System.IO.File]::WriteAllText($schemaPath, $schema, $utf8NoBom)
Write-Host "Updated canonical schema overlay:" -ForegroundColor Green
Write-Host $schemaPath
