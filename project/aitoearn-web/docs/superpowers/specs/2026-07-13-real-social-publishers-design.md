# Real Social Publisher Design

## Scope
Replace local-only success for Facebook, Instagram, Pinterest, and YouTube with real platform API calls. TikTok remains creator-inbox upload until Direct Post approval.

## Rules
- Platform API response is the source of truth.
- A record is released only after a platform work ID exists.
- Persist platform status, work URL, and actionable error.
- Reuse stored OAuth tokens; refresh YouTube when required.
- Upload the existing local video bytes; never expose tokens to clients.
- `Publish now` must execute or reject; never mutate status alone.
