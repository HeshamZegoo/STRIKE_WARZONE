$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path "node_modules")) { npm install }
npm run tauri:build
Write-Host "`nBuild output: src-tauri\target\release\bundle" -ForegroundColor Green
