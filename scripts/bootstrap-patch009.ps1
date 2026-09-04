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
    throw "Échec de pnpm $($Arguments -join ' ')."
  }
}

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$nodeVersionText = (& node -p "process.versions.node").Trim()
$nodeVersion = [version]$nodeVersionText

if (-not (Test-CompatibleNodeVersion -Version $nodeVersion)) {
  throw "Node.js $nodeVersionText n'est pas compatible. Utilisez ^22.19.0, ^24.11.0 ou >=26.0.0."
}

Write-Host "[Patch 009] Node.js $nodeVersionText"

$pnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue
if ($null -ne $pnpmCommand) {
  $pnpmVersion = (& pnpm --version).Trim()
  if ($pnpmVersion -ne '9.15.9') {
    Write-Host "[Patch 009] pnpm $pnpmVersion détecté ; pnpm 9.15.9 est requis."
    $pnpmCommand = $null
  }
}

if ($null -eq $pnpmCommand) {
  $corepackCommand = Get-Command corepack -ErrorAction SilentlyContinue
  if ($null -eq $corepackCommand) {
    throw 'pnpm 9.15.9 est requis. Installez-le ou rendez Corepack disponible, puis relancez ce script.'
  }

  Write-Host '[Patch 009] Préparation de pnpm 9.15.9 via Corepack'
  & corepack prepare pnpm@9.15.9 --activate
  if ($LASTEXITCODE -ne 0) { throw 'Échec de la préparation Corepack.' }
  $script:UseCorepack = $true
  $pnpmVersion = (& corepack pnpm --version).Trim()
}

if ($pnpmVersion -ne '9.15.9') {
  throw "pnpm $pnpmVersion détecté, version attendue : 9.15.9."
}

Write-Host '[Patch 009] Régénération contrôlée du lockfile Nuxt 4.5.2 / Vite 8'
Invoke-Pnpm @('install', '--no-frozen-lockfile')

Write-Host '[Patch 009] Vérification des contrats'
Invoke-Pnpm @('check:contract')
Invoke-Pnpm @('check:toolchain')

Write-Host '[Patch 009] Gate de release complet'
Invoke-Pnpm @('verify:release')

Write-Host '[Patch 009] Lockfile et gate de release validés.'
