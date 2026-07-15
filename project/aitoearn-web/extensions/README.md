# Automation packs (SocialOps Hub)

Vendored from FlowVeo3 + SocialOps bridge shell. Wired into **Browser Workspace**.

## Packs

| Pack | Path | Role | Status |
|------|------|------|--------|
| SocialOps Bridge | `../../social-ops/extension` | Control plane (lease/heartbeat) | active |
| Grok Automation | `grok-automation-ext/` | chat / image / video | experimental |
| ChatGPT Automation | `chatgpt-automation-ext/` | chat / image | experimental |
| Gemini Automation | `gemini-automation-ext/` | chat / image | experimental |
| Flow Automation | `flow-automation-ext/` (+ `FlowAutomation-dist/`) | video (labs.google) | **content path: CDP drive + archive** |

## Profiles that work

| Kind | Button / action | What happens |
|------|-----------------|--------------|
| **App primary** | Prepare primary seat | Fresh dir `browser-seats/primary` + **5 packs** forced (`--load-extension` + `--disable-extensions-except`) |
| **App pool** | New app seat | New dir `browser-seats/seat-…` + same 5 packs |
| **Chrome Profile 6** | Launch Profile 6 | Uses real `User Data\Profile 6` (logins kept) + force-loads **Bridge** only; keeps store niches |
| **Any CDP** | Attach CDP | Playwright-style attach; packs must already be in that Chrome |

### Browser engine: Cloak v146 (recommended)

Stock Chrome 150 often fights extension loading. **Cloak Browser free v146** works cleanly with all packs.

- Release: https://github.com/CloakHQ/CloakBrowser/releases/tag/chromium-v146.0.7680.177.5  
- Asset: `cloakbrowser-windows-x64.zip`  
- Install to: `%LOCALAPPDATA%\SocialsHub\browsers\cloak-v146\chrome.exe`  
- Env: `SOCIALOPS_BROWSER_ENGINE=auto|cloak|chrome` (default **auto** = Cloak if present)

Verified: Cloak loads **5/5** service workers (Bridge + Grok + ChatGPT + Gemini + Flow).

Chrome 137+ blocks `--load-extension` unless `DisableLoadExtensionCommandLineSwitch` is disabled — launcher sets that for stock Chrome.

### Profile 6 note

If Launch Profile 6 fails with “CDP not ready”, **close every Chrome window** using Profile 6 (profile lock), then retry. Do not run normal Chrome and debug Profile 6 at the same time without a free profile.

## How to run

1. Start SocialOps: `next start -p 6061` + `SOCIALOPS_LOCAL_MODE=1` (or tunnel live)
2. Workspace:
   - **Prepare primary seat** and/or **Launch Profile 6** and/or **New app seat**
   - **Verify exts**
3. Auth & sessions: vault → assisted login → export cookies
4. Bridge auto-pairs via `pair-config` (popup: Pair with Hub if needed)
5. Draft-box: pick models tagged **Browser** (`ext:flow:video` for Flow content)
6. Workspace → **SEO / Flow media defaults** (Flow: 9:16 · 6s|10s · 1080p; Hub overrides in `%APPDATA%/SocialsHub/media-defaults.json`)
7. Workspace → **Sync remote configs** — mirrors author selector configs into `%APPDATA%/SocialsHub/extension-remote-configs/`. Extensions try Hub first, then author CDN.

### Flow → content management (real, not shell)

| Step | What happens |
|------|----------------|
| Draft-box `ext:flow:video` | `processDraftTask` uses **flow_cdp_driver** (not navigate-only bridge) |
| Seat CDP | Opens labs.google → project → fill prompt → Create |
| Wait | Polls up to ~8 min for `<video>` / tiles; progress updates on task |
| Extract | Prefers `https` media URL; else CDP reads `blob:` as base64 |
| Archive | Writes `%APPDATA%/SocialsHub` generated asset + `/api/ai/assets/…/file` |
| Material | `persistGenerationMaterial` when `groupId` present → Draft library |
| Fail honest | No downloadable media → **failed** (not fake 70% success) |

Bridge jobs that only `navigate` + `manual_checkpoint` still complete shell — for Flow, Hub **does not** treat that as success.

### Author remote-config dependency (mirrored)

| Pack | Upstream path | Secret (in pack remoteConfig) | Selectors (approx) |
|------|---------------|-------------------------------|--------------------|
| Grok | `/config/grok-automation` | `YES_THAT_IS_VERY_EASY_RIGHT_?` | ~46 |
| ChatGPT | `/config/chatgpt-automation` | `…RIGHT_%511` | ~15 |
| Gemini | `/config/gemini-automation` | `…RIGHT_??@&` | ~15 |
| Flow | `/config/flow-automation` | `…RIGHT_?!$` | ~60 |

Upstream bases (final fallback): `https://configs.kylenguyen.me`, `https://extension-config.onegreen.workers.dev`  
Hub primary: `http://127.0.0.1:6061/api/ai/providers/extension/mirror/config/{pack}`

### Auto-login reality check

| Approach | What we do | What we don't |
|----------|------------|----------------|
| App-owned profile | Cookies persist on disk after first login | — |
| Cookie export/import | Snapshot + restore via CDP | Clone random Chrome profiles by default |
| Credential vault + fill | Types email/password into known fields | CAPTCHA / email OTP / device approval |
| Bridge auto-pair | Ext polls Hub every ~30s | Manual token paste every time |

**Best ops pattern:** 1 primary seat → login once (assisted + human challenge) → Export sessions → daily Restore if needed → keep seat profile dir intact.

## Bridge API (local BFF)

| Method | Path |
|--------|------|
| GET | `/api/ai/providers/extension/packs` |
| POST | `/api/ai/providers/extension/bridge/register` |
| POST | `/api/ai/providers/extension/bridge/heartbeat` |
| POST | `/api/ai/providers/extension/bridge/jobs` |
| POST | `/api/ai/providers/extension/bridge/jobs/next` |
| POST | `/api/ai/providers/extension/bridge/jobs/complete` |
| POST | `/api/ai/providers/workspace` `action=prepare_primary_seat` |

## Sync upstream ext builds

Each niche pack still has `update.ps1` (Chrome store → re-apply patches).

```powershell
cd extensions/grok-automation-ext
.\update.ps1
```

## Notes

- Phase 1: **one primary seat**, Browser concurrency = 1, no silent API fallback.
- Grok **API** video path remains the production default; Browser is experimental.
- Pool seats / multi-profile scheduler = Phase 2 (see `CONSENSUS-FINAL-ext-integration.md`).
