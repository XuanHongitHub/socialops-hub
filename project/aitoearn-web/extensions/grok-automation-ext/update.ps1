#requires -Version 5.1
<#
.SYNOPSIS
  Sync Flow Automation from the original Chrome-installed extension, then re-apply local customs.

.DESCRIPTION
  1) Finds the newest installed copy of the original extension (Chrome profile Extensions folder)
  2) Copies it into this folder (preserving custom/, update scripts, .git)
  3) Applies JSON patches from custom/patches/
  4) Copies optional file overlays from custom/overlays/
  Skips Chrome-reserved names starting with "_" (e.g. _metadata).

.PARAMETER Check
  Only report whether an update is available.

.PARAMETER Force
  Re-sync + re-apply patches even when versions match.

.PARAMETER Watch
  Keep running and auto-update when a newer original version appears.

.PARAMETER IntervalMinutes
  Watch / schedule interval (default from config or 60).

.PARAMETER InstallSchedule
  Register a Windows scheduled task for auto-update.

.PARAMETER UninstallSchedule
  Remove the scheduled task.

.PARAMETER Profile
  Prefer a specific Chrome profile folder name, e.g. "Profile 6".

.PARAMETER ApplyOnly
  Do not copy from original; only re-apply patches + overlays to the current tree.
#>
[CmdletBinding()]
param(
  [switch]$Check,
  [switch]$Force,
  [switch]$Watch,
  [int]$IntervalMinutes = 0,
  [switch]$InstallSchedule,
  [switch]$UninstallSchedule,
  [string]$Profile = "",
  [switch]$ApplyOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$ExtRoot = $ScriptDir
$CustomDir = Join-Path $ExtRoot "custom"
$ConfigPath = Join-Path $CustomDir "config.json"
$StatusPath = Join-Path $CustomDir "update-status.json"
$PatchesDir = Join-Path $CustomDir "patches"
$OverlaysDir = Join-Path $CustomDir "overlays"
$TaskName = "FlowAutomationExt-AutoUpdate"

function Write-Info([string]$Message) { Write-Host "[info]  $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message)   { Write-Host "[ok]    $Message" -ForegroundColor Green }
function Write-Warn([string]$Message) { Write-Host "[warn]  $Message" -ForegroundColor Yellow }
function Write-Err([string]$Message)  { Write-Host "[error] $Message" -ForegroundColor Red }

function Expand-EnvPath([string]$Path) {
  [Environment]::ExpandEnvironmentVariables($Path)
}

function Read-Config {
  if (-not (Test-Path $ConfigPath)) {
    throw "Missing config: $ConfigPath"
  }
  Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Get-ManifestVersion([string]$ManifestPath) {
  if (-not (Test-Path $ManifestPath)) { return $null }
  $m = Get-Content $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  [PSCustomObject]@{
    version      = [string]$m.version
    version_name = $(if ($m.version_name) { [string]$m.version_name } else { [string]$m.version })
    name         = [string]$m.name
  }
}

function ConvertTo-VersionObject([string]$VersionText) {
  if ([string]::IsNullOrWhiteSpace($VersionText)) { return [version]"0.0.0.0" }
  $clean = ($VersionText -replace "[^0-9.]", "")
  $parts = $clean.Split(".", [System.StringSplitOptions]::RemoveEmptyEntries)
  while ($parts.Count -lt 4) { $parts += "0" }
  if ($parts.Count -gt 4) { $parts = $parts[0..3] }
  try { return [version](($parts -join ".")) } catch { return [version]"0.0.0.0" }
}

function Find-OriginalInstallations {
  param($Config, [string]$PreferredProfile)

  $extensionId = $Config.extensionId
  $results = @()

  $userDataRoots = @()
  foreach ($cand in $Config.chromeUserDataCandidates) {
    $p = Expand-EnvPath ([string]$cand)
    if (Test-Path $p) { $userDataRoots += $p }
  }

  foreach ($root in $userDataRoots) {
    $profiles = Get-ChildItem $root -Directory -ErrorAction SilentlyContinue | Where-Object {
      $_.Name -eq "Default" -or $_.Name -like "Profile *"
    }
    foreach ($prof in $profiles) {
      $extBase = Join-Path $prof.FullName "Extensions\$extensionId"
      if (-not (Test-Path $extBase)) { continue }
      $versions = Get-ChildItem $extBase -Directory -ErrorAction SilentlyContinue
      foreach ($verDir in $versions) {
        $manifest = Join-Path $verDir.FullName "manifest.json"
        if (-not (Test-Path $manifest)) { continue }
        $info = Get-ManifestVersion $manifest
        $results += [PSCustomObject]@{
          Path         = $verDir.FullName
          Profile      = $prof.Name
          UserDataRoot = $root
          Version      = $info.version
          VersionName  = $info.version_name
          VersionObj   = ConvertTo-VersionObject $info.version
          LastWrite    = $verDir.LastWriteTimeUtc
        }
      }
    }
  }

  if ($results.Count -eq 0) {
    return @{ All = @(); Latest = $null }
  }

  $preferred = New-Object System.Collections.Generic.List[string]
  if ($PreferredProfile) { [void]$preferred.Add($PreferredProfile) }
  if ($Config.preferredProfiles) {
    foreach ($p in @($Config.preferredProfiles)) {
      if (-not [string]::IsNullOrWhiteSpace($p) -and -not $preferred.Contains($p)) {
        [void]$preferred.Add($p)
      }
    }
  }

  # Highest version wins; preferred profile then newest write break ties
  $chosen = $results | Sort-Object `
    @{ Expression = "VersionObj"; Descending = $true }, `
    @{ Expression = {
        $i = $preferred.IndexOf($_.Profile)
        if ($i -lt 0) { 999 } else { $i }
      } }, `
    @{ Expression = "LastWrite"; Descending = $true } |
    Select-Object -First 1

  return @{
    All    = $results
    Latest = $chosen
  }
}

function Test-IsPreservedPath {
  param([string]$RelativePath, $PreservePaths)
  $rel = $RelativePath.Replace("/", "\").TrimStart(".\")
  foreach ($p in $PreservePaths) {
    $pp = ([string]$p).Replace("/", "\").TrimStart(".\")
    if ($rel -eq $pp -or $rel.StartsWith($pp + "\", [System.StringComparison]::OrdinalIgnoreCase)) {
      return $true
    }
  }
  return $false
}

function Test-IsChromeReservedPath {
  param([string]$RelativePath)
  # Chrome forbids any file/dir name starting with "_" in unpacked extensions
  $parts = $RelativePath.Replace("/", "\").Split("\", [System.StringSplitOptions]::RemoveEmptyEntries)
  foreach ($part in $parts) {
    if ($part.StartsWith("_")) { return $true }
  }
  return $false
}

function Remove-ChromeReservedItems {
  param([string]$TargetDir)
  $removed = 0
  $items = @(Get-ChildItem $TargetDir -Recurse -Force -ErrorAction SilentlyContinue |
    Sort-Object { $_.FullName.Length } -Descending)
  foreach ($item in $items) {
    if ($item.Name.StartsWith("_")) {
      Remove-Item -LiteralPath $item.FullName -Recurse -Force -ErrorAction SilentlyContinue
      $removed++
    }
  }
  if ($removed -gt 0) {
    Write-Info "Removed $removed Chrome-reserved '_' item(s)"
  }
}

function Sync-FromOriginal {
  param(
    [string]$SourceDir,
    [string]$TargetDir,
    $PreservePaths
  )

  Write-Info "Syncing from original: $SourceDir"
  $sourceFiles = @(Get-ChildItem $SourceDir -Recurse -File -Force)
  $copied = 0
  $removed = 0
  $skippedReserved = 0

  # Copy / overwrite from original
  foreach ($file in $sourceFiles) {
    $rel = $file.FullName.Substring($SourceDir.Length).TrimStart("\", "/")
    if (Test-IsPreservedPath -RelativePath $rel -PreservePaths $PreservePaths) { continue }
    if (Test-IsChromeReservedPath -RelativePath $rel) {
      $skippedReserved++
      continue
    }
    $dest = Join-Path $TargetDir $rel
    $destParent = Split-Path $dest -Parent
    if (-not (Test-Path $destParent)) {
      New-Item -ItemType Directory -Path $destParent -Force | Out-Null
    }
    Copy-Item -LiteralPath $file.FullName -Destination $dest -Force
    $copied++
  }

  # Remove stale non-preserved files that no longer exist in original
  $targetFiles = @(Get-ChildItem $TargetDir -Recurse -File -Force | Where-Object {
    $rel = $_.FullName.Substring($TargetDir.Length).TrimStart("\", "/")
    -not (Test-IsPreservedPath -RelativePath $rel -PreservePaths $PreservePaths)
  })
  foreach ($file in $targetFiles) {
    $rel = $file.FullName.Substring($TargetDir.Length).TrimStart("\", "/")
    if (Test-IsChromeReservedPath -RelativePath $rel) {
      Remove-Item -LiteralPath $file.FullName -Force -ErrorAction SilentlyContinue
      $removed++
      continue
    }
    $src = Join-Path $SourceDir $rel
    if (-not (Test-Path -LiteralPath $src)) {
      Remove-Item -LiteralPath $file.FullName -Force
      $removed++
    }
  }

  # Drop any leftover Chrome-reserved "_" names (e.g. _metadata)
  Remove-ChromeReservedItems -TargetDir $TargetDir

  # Clean empty dirs (except preserved roots)
  Get-ChildItem $TargetDir -Recurse -Directory -Force |
    Sort-Object { $_.FullName.Length } -Descending |
    ForEach-Object {
      $rel = $_.FullName.Substring($TargetDir.Length).TrimStart("\", "/")
      if (Test-IsPreservedPath -RelativePath $rel -PreservePaths $PreservePaths) { return }
      if ($_.Name.StartsWith("_")) {
        Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
        return
      }
      if (-not (Get-ChildItem $_.FullName -Force -ErrorAction SilentlyContinue | Select-Object -First 1)) {
        Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
      }
    }

  Write-Ok "Copied $copied file(s); removed $removed stale file(s); skipped $skippedReserved reserved '_' path(s)"
}

function Resolve-PatchTargets {
  param([string]$Root, [string[]]$Globs)
  $files = @()
  foreach ($g in $Globs) {
    $files += Get-ChildItem -Path (Join-Path $Root $g) -File -ErrorAction SilentlyContinue
  }
  return @($files | Sort-Object FullName -Unique)
}

function Apply-Patches {
  param([string]$Root, [string]$PatchesDirectory)

  if (-not (Test-Path $PatchesDirectory)) {
    Write-Warn "No patches directory: $PatchesDirectory"
    return @()
  }

  $patchFiles = @(Get-ChildItem $PatchesDirectory -Filter "*.json" | Sort-Object Name)
  $report = @()

  foreach ($pf in $patchFiles) {
    $patch = Get-Content $pf.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($patch.enabled -eq $false) {
      Write-Info "Skip disabled patch: $($patch.id)"
      continue
    }

    Write-Info "Applying patch: $($patch.id) - $($patch.description)"
    $targets = @(Resolve-PatchTargets -Root $Root -Globs @($patch.targetGlobs))
    if ($targets.Count -eq 0) {
      $msg = "No target files matched for patch $($patch.id): $($patch.targetGlobs -join ', ')"
      Write-Err $msg
      $report += [PSCustomObject]@{ Patch = $patch.id; Status = "no-targets"; Detail = $msg }
      continue
    }

    foreach ($target in $targets) {
      $raw = [System.IO.File]::ReadAllText($target.FullName)
      $original = $raw
      $applied = @()
      $failedRequired = @()

      if ($patch.replacements) {
        foreach ($rep in $patch.replacements) {
          $find = [string]$rep.find
          $repl = [string]$rep.replace
          if ($raw.Contains($find)) {
            $raw = $raw.Replace($find, $repl)
            $applied += "exact:$($rep.id)"
          }
          elseif ($raw.Contains($repl)) {
            $applied += "exact:$($rep.id):already"
            Write-Info "  already applied: $($rep.id)"
          }
          else {
            if ($rep.required) {
              $failedRequired += "exact:$($rep.id)"
              Write-Warn "  required exact miss in $($target.Name): $($rep.id)"
            }
            else {
              Write-Info "  optional exact miss: $($rep.id)"
            }
          }
        }
      }

      if ($patch.regexReplacements) {
        foreach ($rep in $patch.regexReplacements) {
          $pattern = [string]$rep.pattern
          $repl = [string]$rep.replace
          $rx = [regex]::new($pattern)
          if ($rx.IsMatch($raw)) {
            $raw = $rx.Replace($raw, $repl)
            $applied += "regex:$($rep.id)"
          }
          elseif ($raw.Contains($repl)) {
            $applied += "regex:$($rep.id):already"
          }
          else {
            if ($rep.required) {
              $failedRequired += "regex:$($rep.id)"
              Write-Warn "  required regex miss in $($target.Name): $($rep.id)"
            }
          }
        }
      }

      $freshApplies = @($applied | Where-Object { $_ -notlike "*:already" })
      $alreadyOnly = ($applied.Count -gt 0) -and ($freshApplies.Count -eq 0)

      if ($raw -ne $original) {
        $utf8NoBom = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::WriteAllText($target.FullName, $raw, $utf8NoBom)
        Write-Ok "  patched $($target.Name) ($($applied -join ', '))"
        $report += [PSCustomObject]@{
          Patch   = $patch.id
          File    = $target.Name
          Status  = $(if ($failedRequired.Count) { "partial" } else { "ok" })
          Applied = ($applied -join ", ")
          Failed  = ($failedRequired -join ", ")
        }
      }
      elseif ($alreadyOnly -and $failedRequired.Count -eq 0) {
        Write-Ok "  already patched: $($target.Name)"
        $report += [PSCustomObject]@{
          Patch   = $patch.id
          File    = $target.Name
          Status  = "already"
          Applied = ($applied -join ", ")
        }
      }
      elseif ($failedRequired.Count) {
        Write-Err "  required rules failed for $($target.Name): $($failedRequired -join ', ')"
        $report += [PSCustomObject]@{
          Patch  = $patch.id
          File   = $target.Name
          Status = "failed"
          Failed = ($failedRequired -join ", ")
        }
      }
      else {
        Write-Warn "  no matching rules for $($target.Name)"
        $report += [PSCustomObject]@{
          Patch  = $patch.id
          File   = $target.Name
          Status = "noop"
        }
      }
    }
  }

  return $report
}

function Apply-Overlays {
  param([string]$Root, [string]$OverlaysDirectory)

  if (-not (Test-Path $OverlaysDirectory)) { return 0 }
  $files = @(Get-ChildItem $OverlaysDirectory -Recurse -File -Force | Where-Object {
    $_.Name -ne ".gitkeep"
  })
  $count = 0
  foreach ($file in $files) {
    $rel = $file.FullName.Substring($OverlaysDirectory.Length).TrimStart("\", "/")
    $dest = Join-Path $Root $rel
    $parent = Split-Path $dest -Parent
    if (-not (Test-Path $parent)) {
      New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    Copy-Item -LiteralPath $file.FullName -Destination $dest -Force
    Write-Ok "overlay -> $rel"
    $count++
  }
  return $count
}

function Save-Status {
  param($Object)
  $json = $Object | ConvertTo-Json -Depth 8
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($StatusPath, $json, $utf8NoBom)
}

function Invoke-UpdateOnce {
  param(
    $Config,
    [switch]$Force,
    [switch]$CheckOnly,
    [switch]$ApplyOnly,
    [string]$PreferredProfile
  )

  $localManifest = Join-Path $ExtRoot "manifest.json"
  $local = Get-ManifestVersion $localManifest
  $preserve = @($Config.preservePaths)
  if (-not $preserve) {
    $preserve = @("custom", "update.ps1", "update.cmd", ".git", ".gitignore")
  }

  if ($ApplyOnly) {
    Write-Info "Apply-only mode (no sync from original)"
    $patchReport = Apply-Patches -Root $ExtRoot -PatchesDirectory $PatchesDir
    $overlayCount = Apply-Overlays -Root $ExtRoot -OverlaysDirectory $OverlaysDir
    $status = [PSCustomObject]@{
      timestamp     = (Get-Date).ToString("o")
      mode          = "apply-only"
      localVersion  = $local.version
      patchReport   = $patchReport
      overlays      = $overlayCount
    }
    Save-Status $status
    Write-Ok "Apply-only complete. Reload the unpacked extension in chrome://extensions"
    return $status
  }

  $found = Find-OriginalInstallations -Config $Config -PreferredProfile $PreferredProfile
  if (-not $found.Latest) {
    throw "Original extension ($($Config.extensionId)) not found in any Chrome profile. Install it once from Chrome Web Store on a profile, then re-run."
  }

  $latest = $found.Latest
  $localVer = ConvertTo-VersionObject $(if ($local) { $local.version } else { "0" })
  $remoteVer = $latest.VersionObj
  $isNewer = $remoteVer -gt $localVer
  $isSame = $remoteVer -eq $localVer

  Write-Info "Local:  $(if($local){$local.version}else{'<none>'}) ($ExtRoot)"
  Write-Info "Origin: $($latest.Version) @ $($latest.Profile) - $($latest.Path)"
  Write-Info ("Other installs: " + ((@($found.All) | ForEach-Object { "$($_.Profile)/$($_.Version)" }) -join ", "))

  if ($CheckOnly) {
    if ($isNewer) {
      Write-Warn "Update available: $($local.version) -> $($latest.Version)"
      return [PSCustomObject]@{ updateAvailable = $true; local = $local.version; origin = $latest.Version }
    }
    Write-Ok "Already up to date ($($local.version))"
    return [PSCustomObject]@{ updateAvailable = $false; local = $local.version; origin = $latest.Version }
  }

  $shouldSync = $Force -or $isNewer -or (-not $local)
  if (-not $shouldSync) {
    if ($Config.autoUpdate.reapplyPatchesIfSameVersion) {
      Write-Info "Same version; re-applying patches only"
      $patchReport = Apply-Patches -Root $ExtRoot -PatchesDirectory $PatchesDir
      $overlayCount = Apply-Overlays -Root $ExtRoot -OverlaysDirectory $OverlaysDir
      $status = [PSCustomObject]@{
        timestamp    = (Get-Date).ToString("o")
        mode         = "repatch-same-version"
        localVersion = $local.version
        originVersion= $latest.Version
        originPath   = $latest.Path
        patchReport  = $patchReport
        overlays     = $overlayCount
      }
      Save-Status $status
      return $status
    }
    Write-Ok "No update needed (use -Force to re-sync + re-patch)"
    return [PSCustomObject]@{ updated = $false; version = $local.version }
  }

  Sync-FromOriginal -SourceDir $latest.Path -TargetDir $ExtRoot -PreservePaths $preserve
  $patchReport = Apply-Patches -Root $ExtRoot -PatchesDirectory $PatchesDir
  $overlayCount = Apply-Overlays -Root $ExtRoot -OverlaysDirectory $OverlaysDir

  $newLocal = Get-ManifestVersion $localManifest
  $failed = @($patchReport | Where-Object { $_.Status -eq "failed" }); if (-not $failed) { $failed = @() }
  $status = [PSCustomObject]@{
    timestamp     = (Get-Date).ToString("o")
    mode          = $(if ($Force -and $isSame) { "force-resync" } else { "updated" })
    localVersion  = $newLocal.version
    originVersion = $latest.Version
    originProfile = $latest.Profile
    originPath    = $latest.Path
    patchReport   = $patchReport
    overlays      = $overlayCount
    success       = ($failed.Count -eq 0)
  }
  Save-Status $status

  if ($failed.Count) {
    Write-Warn "Update finished with patch failures. Check custom/patches for drifted patterns."
  }
  else {
    Write-Ok "Update complete -> v$($newLocal.version). Reload unpacked extension in chrome://extensions"
  }
  return $status
}

function Install-AutoUpdateTask {
  param([int]$Minutes)
  $ps = Join-Path $ExtRoot "update.ps1"
  $arg = "-NoProfile -ExecutionPolicy Bypass -File `"$ps`""
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arg -WorkingDirectory $ExtRoot
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $Minutes) -RepetitionDuration ([TimeSpan]::MaxValue)
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
  Write-Ok "Scheduled task '$TaskName' every $Minutes minute(s)"
}

function Uninstall-AutoUpdateTask {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Ok "Removed scheduled task '$TaskName' (if it existed)"
}

# --- main ---
$config = Read-Config
$interval = $IntervalMinutes
if ($interval -le 0) {
  if ($config.autoUpdate -and $config.autoUpdate.intervalMinutes) {
    $interval = [int]$config.autoUpdate.intervalMinutes
  }
  else { $interval = 60 }
}

if ($UninstallSchedule) {
  Uninstall-AutoUpdateTask
  return
}

if ($InstallSchedule) {
  Install-AutoUpdateTask -Minutes $interval
  return
}

if ($Watch) {
  Write-Info "Watch mode every $interval minute(s). Ctrl+C to stop."
  while ($true) {
    try {
      Invoke-UpdateOnce -Config $config -Force:$Force -CheckOnly:$Check -ApplyOnly:$ApplyOnly -PreferredProfile $Profile | Out-Null
    }
    catch {
      Write-Err $_.Exception.Message
    }
    Start-Sleep -Seconds ([Math]::Max(60, $interval * 60))
  }
}
else {
  Invoke-UpdateOnce -Config $config -Force:$Force -CheckOnly:$Check -ApplyOnly:$ApplyOnly -PreferredProfile $Profile | Out-Null
}
