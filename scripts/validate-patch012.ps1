$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Test-CompatibleNodeVersion {
  param([Parameter(Mandatory = $true)][version]$Version)

  if ($Version.Major -ge 26) { return $true }
  if ($Version.Major -eq 24) { return $Version -ge [version]'24.11.0' }
  if ($Version.Major -eq 22) { return $Version -ge [version]'22.19.0' }
  return $false
}

$script:UseCorepack = $false

function Invoke-Pnpm {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  if ($script:UseCorepack) {
    & corepack pnpm @Arguments
  }
  else {
    & pnpm @Arguments
  }

  if ($LASTEXITCODE -ne 0) {
    throw "pnpm command failed: $($Arguments -join ' ')."
  }
}

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$nodeVersionText = (& node -p "process.versions.node").Trim()
$nodeVersion = [version]$nodeVersionText

if (-not (Test-CompatibleNodeVersion -Version $nodeVersion)) {
  throw "Node.js $nodeVersionText is not compatible. Use ^22.19.0, ^24.11.0 or >=26.0.0."
}

Write-Host "[Patch 012] Node.js $nodeVersionText"

$pnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue
if ($null -ne $pnpmCommand) {
  $pnpmVersion = (& pnpm --version).Trim()
  if ($pnpmVersion -ne '9.15.9') {
    Write-Host "[Patch 012] pnpm $pnpmVersion detected; pnpm 9.15.9 is required."
    $pnpmCommand = $null
  }
}

if ($null -eq $pnpmCommand) {
  $corepackCommand = Get-Command corepack -ErrorAction SilentlyContinue
  if ($null -eq $corepackCommand) {
    throw 'pnpm 9.15.9 is required. Install it or make Corepack available, then rerun this script.'
  }

  Write-Host '[Patch 012] Preparing pnpm 9.15.9 with Corepack'
  & corepack prepare pnpm@9.15.9 --activate
  if ($LASTEXITCODE -ne 0) { throw 'Corepack preparation failed.' }
  $script:UseCorepack = $true
  $pnpmVersion = (& corepack pnpm --version).Trim()
}

if ($pnpmVersion -ne '9.15.9') {
  throw "pnpm $pnpmVersion detected; expected version is 9.15.9."
}

Write-Host '[Patch 012] Deterministic install with frozen lockfile'
Invoke-Pnpm @('install', '--frozen-lockfile')

Write-Host '[Patch 012] Checking package, toolchain and Trusted Publishing contracts'
Invoke-Pnpm @('check:contract')
Invoke-Pnpm @('check:toolchain')
Invoke-Pnpm @('check:publishing')

Write-Host '[Patch 012] Running complete release gate'
Invoke-Pnpm @('verify:release')

Write-Host '[Patch 012] Confirming that local publish is blocked'
Invoke-Pnpm @('check:local-publish-guard')

Write-Host '[Patch 012] Local baseline validated. Actual OIDC publication must run in GitHub Actions.'
