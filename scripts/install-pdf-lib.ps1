$ErrorActionPreference = "Stop"
$target = Join-Path $PSScriptRoot "..\vendor\pdf-lib.min.js"
$url = "https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js"
Write-Host "Downloading pdf-lib..."
Invoke-WebRequest -Uri $url -OutFile $target
Write-Host "Saved to $target"
Write-Host "Reload the extension at chrome://extensions after this completes."
