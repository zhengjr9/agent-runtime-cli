$ErrorActionPreference = 'Stop'

$ProjectName = 'agent-runtime-cli'
$BinName = 'agent-cli'
$InstallRoot = if ($env:AGENT_RUNTIME_CLI_HOME) { $env:AGENT_RUNTIME_CLI_HOME } else { Join-Path $HOME '.agent-runtime-cli' }
$InstallDir = Join-Path $InstallRoot 'offline\current'
$LinkDir = Join-Path $HOME '.local\bin'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PackageRoot = $ScriptDir
$AppSourceDir = Join-Path $PackageRoot 'app'
$BundledBunExe = Join-Path $PackageRoot 'bun\bin\bun.exe'

if (-not (Test-Path $AppSourceDir)) {
  throw "Offline bundle is missing app directory: $AppSourceDir"
}

if (-not (Test-Path (Join-Path $AppSourceDir 'package.json'))) {
  throw "Offline bundle is incomplete: package.json not found"
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $LinkDir | Out-Null

$InstalledAppDir = Join-Path $InstallDir 'app'
$InstalledBunDir = Join-Path $InstallDir 'bun'

if (Test-Path $InstalledAppDir) {
  Remove-Item -Recurse -Force $InstalledAppDir
}
if (Test-Path $InstalledBunDir) {
  Remove-Item -Recurse -Force $InstalledBunDir
}

Copy-Item -Recurse -Force $AppSourceDir $InstalledAppDir

if (Test-Path $BundledBunExe) {
  New-Item -ItemType Directory -Force -Path (Join-Path $InstalledBunDir 'bin') | Out-Null
  Copy-Item -Force $BundledBunExe (Join-Path $InstalledBunDir 'bin\bun.exe')
}

$LauncherCmd = Join-Path $InstallDir "$BinName.cmd"
$LauncherPs1 = Join-Path $InstallDir "$BinName.ps1"

@"
@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
if exist "%SCRIPT_DIR%bun\bin\bun.exe" (
  "%SCRIPT_DIR%bun\bin\bun.exe" run "%SCRIPT_DIR%app\src\agent-cli.tsx" %*
  exit /b %ERRORLEVEL%
)
node --import tsx "%SCRIPT_DIR%app\src\agent-cli.tsx" %*
"@ | Set-Content -NoNewline $LauncherCmd

@"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$bunExe = Join-Path $scriptDir 'bun\bin\bun.exe'
$entry = Join-Path $scriptDir 'app\src\agent-cli.tsx'
if (Test-Path $bunExe) {
  & $bunExe run $entry @args
  exit $LASTEXITCODE
}
node --import tsx $entry @args
exit $LASTEXITCODE
"@ | Set-Content $LauncherPs1

$LinkedCmd = Join-Path $LinkDir "$BinName.cmd"
Copy-Item -Force $LauncherCmd $LinkedCmd

Write-Host ""
Write-Host "$ProjectName offline bundle installed successfully."
Write-Host "Run:"
Write-Host ""
Write-Host "  $BinName.cmd"
Write-Host ""
