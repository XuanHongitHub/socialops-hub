# SocialOps Hub

SocialOps Hub is the custom fork of AiToEarn for brand-owned social account operations.

## Custom Scope

- English-first social profile management.
- Planning, scheduling, and publishing workflow for Facebook, Instagram, YouTube, Pinterest, TikTok, X, and LinkedIn.
- Manual fallback for platforms that need app review or unavailable API permissions.
- Brand context and calendar files under `social-ops/`.

## Fork Policy

- `upstream` points to `https://github.com/yikart/AiToEarn.git` and is fetch-only.
- `origin` points to `https://github.com/XuanHongitHub/socialops-hub.git`.
- Keep custom product decisions in this fork; do not patch upstream assumptions directly unless required.
- Prefer small, isolated commits so upstream updates can be merged or cherry-picked safely.

## Protected Custom Areas

- `SOCIALOPS.md`
- `social-ops/`
- `docs/SOCIAL_PLATFORM_CONFIG_RUNBOOK.md`
- `docs/SOCIALOPS_CUSTOM_LAYER.md`
- local `.social-assets/` generated for account setup and social seed content

## Platform Setup Runbook

- Follow `docs/SOCIAL_PLATFORM_CONFIG_RUNBOOK.md` for OAuth/app setup, browser ops, and troubleshooting.
- When a platform setup breaks, update that runbook with cause, fix, and verification before moving on.

## Live Runtime Rule

- Public SocialOps URL must run production build via `project/aitoearn-web` script `npm run live`.
- Do not expose `next dev` through Cloudflare tunnel; dev cold compiles can reset requests and look like network errors.
- Before rebuilding local production, stop any `next dev/start -p 6061`, delete `.next`, build with `SOCIALOPS_LOCAL_MODE=1`, then start `next start -p 6061`.
- On Windows local production build, `SOCIALOPS_LOCAL_MODE=1` disables Next `standalone` output to avoid pnpm symlink `EPERM`.
- Health check after every runtime change: `/`, `/healthz`, `/en/accounts`, `/api/v2/channels/accounts` on both localhost and `https://socialops.bebio.site`.

## Upstream Update Rule

Use `scripts/sync-upstream.ps1` from a clean working tree. It creates a review branch and never updates `main` directly.
