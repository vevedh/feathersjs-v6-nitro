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

Write-Host "[Patch 011] Node.js $nodeVersionText"

$pnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue
if ($null -ne $pnpmCommand) {
  $pnpmVersion = (& pnpm --version).Trim()
  if ($pnpmVersion -ne '9.15.9') {
    Write-Host "[Patch 011] pnpm $pnpmVersion detected; pnpm 9.15.9 is required."
    $pnpmCommand = $null
  }
}

if ($null -eq $pnpmCommand) {
  $corepackCommand = Get-Command corepack -ErrorAction SilentlyContinue
  if ($null -eq $corepackCommand) {
    throw 'pnpm 9.15.9 is required. Install it or make Corepack available, then rerun this script.'
  }

  Write-Host '[Patch 011] Preparing pnpm 9.15.9 with Corepack'
  & corepack prepare pnpm@9.15.9 --activate
  if ($LASTEXITCODE -ne 0) { throw 'Corepack preparation failed.' }
  $script:UseCorepack = $true
  $pnpmVersion = (& corepack pnpm --version).Trim()
}

if ($pnpmVersion -ne '9.15.9') {
  throw "pnpm $pnpmVersion detected; expected version is 9.15.9."
}

Write-Host '[Patch 011] Updating quality-gate dependencies and regenerating lockfile'
Invoke-Pnpm @('install', '--no-frozen-lockfile')

Write-Host '[Patch 011] Checking package and toolchain contracts'
Invoke-Pnpm @('check:contract')
Invoke-Pnpm @('check:toolchain')

Write-Host '[Patch 011] Running V8 coverage gate'
Invoke-Pnpm @('test:coverage')

Write-Host '[Patch 011] Running complete release gate'
Invoke-Pnpm @('verify:release')

Write-Host '[Patch 011] Quality gates completed. Return pnpm-lock.yaml and the coverage summary for final freeze.'
