param(
  [ValidateSet('dev', 'prod')]
  [string]$Mode = 'prod',
  [int]$Port = 6061,
  [string]$PublicUrl = 'https://socialops.bebio.site/',
  [string]$TunnelConfig = "$env:USERPROFILE\.cloudflared\socialops-bebio.yml"
)

$ErrorActionPreference = 'SilentlyContinue'
$Root = Split-Path $PSScriptRoot -Parent
$Next = Join-Path $Root 'node_modules\next\dist\bin\next'
$Out = Join-Path $Root ".socialops-$Mode.out.log"
$Err = Join-Path $Root ".socialops-$Mode.err.log"
$env:SOCIALOPS_LOCAL_MODE = '1'
$HealthFailures = 0

function Test-Url($Url, [int]$TimeoutSec = 15) {
  try {
    $res = Invoke-WebRequest -UseBasicParsing -MaximumRedirection 0 -TimeoutSec $TimeoutSec $Url
    return ($res.StatusCode -ge 200 -and $res.StatusCode -lt 300)
  }
  catch {
    return $false
  }
}

function Start-App() {
  if ($Mode -eq 'prod') {
    Get-CimInstance Win32_Process |
      Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match "next.*-p $Port" -and $_.CommandLine -like "*$Root*" } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    Push-Location $Root
    Remove-Item -Recurse -Force (Join-Path $Root '.next') -ErrorAction SilentlyContinue
    node $Next build
    if ($LASTEXITCODE -ne 0 -and -not (Test-Path (Join-Path $Root '.next\BUILD_ID'))) { throw 'SocialOps production build failed' }
    Pop-Location
  }
  $args = if ($Mode -eq 'prod') { @($Next, 'start', '-p', "$Port") } else { @($Next, 'dev', '-p', "$Port") }
  Start-Process -WindowStyle Hidden -FilePath 'node' -ArgumentList $args -WorkingDirectory $Root -RedirectStandardOutput $Out -RedirectStandardError $Err
}

function Warm-App() {
  @(
    "http://localhost:$Port/",
    "http://localhost:$Port/healthz",
    "http://localhost:$Port/api/user/mine",
    "http://localhost:$Port/api/notification/unread-count",
    "http://localhost:$Port/api/v2/channels/accounts",
    "http://localhost:$Port/en/accounts",
    "http://localhost:$Port/en/draft-box"
  ) | ForEach-Object { [void](Test-Url $_ 180) }
}

function Ensure-App() {
  $listening = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
  if (-not $listening) {
    Get-CimInstance Win32_Process |
      Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match "next.*-p $Port" -and $_.CommandLine -like "*$Root*" } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    Start-App
    Start-Sleep -Seconds 8
    Warm-App
    $script:HealthFailures = 0
    return
  }

  if (Test-Url "http://localhost:$Port/healthz" 25) {
    $script:HealthFailures = 0
  }
  else {
    $script:HealthFailures += 1
  }

  if ($script:HealthFailures -ge 5) {
    Get-CimInstance Win32_Process |
      Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match "next.*-p $Port" -and $_.CommandLine -like "*$Root*" } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    Start-App
    Start-Sleep -Seconds 8
    Warm-App
    $script:HealthFailures = 0
  }
}

function Ensure-Tunnel() {
  if (-not (Test-Path $TunnelConfig)) { return }
  $running = Get-CimInstance Win32_Process |
    Where-Object { $_.Name -eq 'cloudflared.exe' -and $_.CommandLine -like "*$TunnelConfig*" }
  if (-not $running) {
    $cfErr = Join-Path $Root ".cloudflared.err.log"
    Start-Process -WindowStyle Hidden -FilePath 'C:\Program Files (x86)\cloudflared\cloudflared.exe' -ArgumentList 'tunnel', '--config', $TunnelConfig, 'run' -RedirectStandardError $cfErr
    Start-Sleep -Seconds 5
  }
}

while ($true) {
  Ensure-App
  Ensure-Tunnel
  if (-not (Test-Url $PublicUrl 30)) {
    Ensure-App
    Ensure-Tunnel
  }
  Start-Sleep -Seconds 20
}



