$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "`n=== STRIKE WARZON setup ===" -ForegroundColor Cyan

function Test-Command($name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

if (-not (Test-Command "node") -or -not (Test-Command "npm")) {
  throw "Node.js LTS is missing. Install it from https://nodejs.org/ then reopen PowerShell."
}
if (-not (Test-Command "cargo") -or -not (Test-Command "rustc")) {
  throw "Rust is missing. Install it from https://rustup.rs/ then reopen PowerShell."
}

Write-Host "[1/3] Installing JavaScript dependencies..."
npm install

Write-Host "[2/3] Checking Rust Windows target..."
rustup target add x86_64-pc-windows-msvc

Write-Host "[3/3] Checking Tauri CLI..."
npx tauri --version

Write-Host "`nSetup complete. Run .\RUN_GAME.ps1 to play in development mode." -ForegroundColor Green
