# SocialOps Agent Coordination

Shared runtime/build ledger for Codex, Grok, Playwright agents, and other local automation. Read before touching `.next`, port `6061`, or Cloudflare Tunnel.

## Runtime Contract

- Public runtime: production `next start -p 6061` only.
- Public URL: `https://socialops.bebio.site`.
- Build owner exclusively controls `.next`, port `6061`, and production restart.
- Development work uses another port. Never run `next dev` on `6061`.
- Claim before mutation. Release after health checks.
- Stale claim: PID dead, or no update for 30 minutes. Confirm before clearing.
- Cleanup: retain active claims and latest 10 completed rows. Remove older completed rows during the next claim/release update.

## Active Runtime Claim

| Agent | State | Purpose | PID | Started | Updated | Files/Surface |
|---|---|---|---:|---|---|---|
| none | released | Production available | - | - | 2026-07-14 10:55 +07:00 | `project/aitoearn-web/.next`, port `6061` |

## Coordination Procedure

1. Read this file and inspect matching processes.
2. If another live claim exists, do not build/restart. Work on disjoint source only or wait.
3. Replace the `none` row with your active claim before runtime mutation.
4. Update `Updated` after long operations or each major phase.
5. Run type-check/build, start production, verify local/public health.
6. Record result in Recent Completions, restore Active Runtime Claim to `none`.
7. Prune Recent Completions beyond 10 rows.

## Safe Process Check

```powershell
Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -eq 'node.exe' -and
    $_.CommandLine -like '*AiToEarn*next*'
  } | Select-Object ProcessId, ParentProcessId, CommandLine
```

Never search/kill using a pattern that can match the current PowerShell command itself. Filter `node.exe` first.

## Recent Completions

| Agent | Result | Completed | Verification |
|---|---|---|---|
| Codex | Added shared coordination rules; compacted Vision progress UI | 2026-07-14 10:55 +07:00 | Type-check/build PASS; local/public/draft HTTP 200 |
