param(
  [string]$UpstreamRemote = "upstream",
  [string]$UpstreamBranch = "main",
  [string]$BaseBranch = "main"
)

$ErrorActionPreference = "Stop"

function Run($Command, $Args) {
  & $Command @Args
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $Command $($Args -join ' ')"
  }
}

$dirty = git status --porcelain
if ($dirty) {
  Write-Error "Working tree is dirty. Commit/stash first, then rerun."
}

Run git @("fetch", "origin", "--prune")
Run git @("fetch", $UpstreamRemote, "--prune")

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$branch = "sync/upstream-$stamp"

Run git @("checkout", $BaseBranch)
Run git @("checkout", "-b", $branch)

Write-Host "Merging $UpstreamRemote/$UpstreamBranch into $branch with --no-commit..."
git merge "$UpstreamRemote/$UpstreamBranch" --no-commit --no-ff

if ($LASTEXITCODE -ne 0) {
  Write-Host "Merge conflicts found. Resolve them, run checks, then commit." -ForegroundColor Yellow
  exit 1
}

Write-Host "Merge staged but not committed. Review diff, run checks, then commit." -ForegroundColor Green
