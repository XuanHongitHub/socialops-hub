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
- local `.social-assets/` generated for account setup and social seed content

## Upstream Update Rule

Use `scripts/sync-upstream.ps1` from a clean working tree. It creates a review branch and never updates `main` directly.
