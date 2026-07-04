# Upstream Update Workflow

Goal: keep SocialOps Hub updated from AiToEarn without losing custom social-ops decisions.

## Remotes

```powershell
git remote -v
```

Expected:

- `origin` → `https://github.com/XuanHongitHub/socialops-hub.git`
- `upstream` → `https://github.com/yikart/AiToEarn.git`
- `upstream` push URL → `DISABLED`

## Safe Update

```powershell
pwsh scripts/sync-upstream.ps1
```

The script:

1. stops if local changes exist;
2. fetches `origin` and `upstream`;
3. creates `sync/upstream-YYYYMMDD-HHMMSS` from current `main`;
4. merges `upstream/main` with `--no-commit`;
5. lets you review conflicts, build, then commit manually.

## Review Checklist

- Check renamed platform modules, auth/session changes, scheduler changes, Docker changes, and config format changes.
- Keep SocialOps-specific docs/context under `SOCIALOPS.md` and `social-ops/`.
- If upstream removes a platform we need, decide explicitly: restore, replace, or mark manual-only.
- Run the smallest relevant checks after resolving conflicts.

## Finish

```powershell
git status
git diff --stat
git commit -m "chore: sync upstream AiToEarn"
git push -u origin HEAD
```

Open a PR into `main`, test, then merge.
