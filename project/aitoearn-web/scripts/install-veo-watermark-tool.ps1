# Download GeminiWatermarkTool-Video.exe into SocialsHub/tools
$ErrorActionPreference = 'Stop'
$tools = Join-Path $env:APPDATA 'SocialsHub\tools'
New-Item -ItemType Directory -Force -Path $tools | Out-Null
$out = Join-Path $tools 'GeminiWatermarkTool-Video.exe'

Write-Host "Target: $out"
Write-Host "Fetching latest release metadata..."

$api = 'https://api.github.com/repos/allenk/VeoWatermarkRemover/releases/latest'
$rel = Invoke-RestMethod -Uri $api -Headers @{ 'User-Agent' = 'SocialOps-Installer' }
# Prefer Windows binaries only (never Linux/mac assets)
$asset = $rel.assets | Where-Object {
  $_.name -match '\.exe$' -and $_.name -notmatch 'Linux|macOS|Darwin|arm64'
} | Select-Object -First 1

if (-not $asset) {
  $asset = $rel.assets | Where-Object {
    $_.name -match '\.zip$' -and $_.name -match 'Windows|Win|win-x64' -and $_.name -notmatch 'Linux|macOS'
  } | Select-Object -First 1
}

if (-not $asset) {
  Write-Host "Could not auto-pick asset. Open: $($rel.html_url)"
  Write-Host "Download GeminiWatermarkTool-Video.exe manually to: $tools"
  exit 2
}

Write-Host "Asset: $($asset.name)"
$tmp = Join-Path $env:TEMP $asset.name
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $tmp -UseBasicParsing

if ($asset.name -match '\.zip$') {
  $extract = Join-Path $env:TEMP 'veo-wm-extract'
  if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
  Expand-Archive -Path $tmp -DestinationPath $extract -Force
  $exe = Get-ChildItem $extract -Recurse -Filter '*.exe' | Select-Object -First 1
  if (-not $exe) { throw 'No exe in zip' }
  Copy-Item $exe.FullName $out -Force
}
else {
  Copy-Item $tmp $out -Force
}

Write-Host "Installed: $out"
Write-Host "Size: $((Get-Item $out).Length) bytes"
Write-Host "Done. Flow archive will auto-run this tool when provider=flow."
