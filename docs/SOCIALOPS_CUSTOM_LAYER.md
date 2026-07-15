# SocialOps Custom Layer

Goal: keep SocialOps Hub a thin fork of AiToEarn while adding local provider/workflow automation.

## Protected Custom Areas

- `project/aitoearn-backend/libs/mongodb/src/schemas/provider-account.schema.ts`
- `project/aitoearn-backend/libs/mongodb/src/repositories/provider-account.repository.ts`
- `project/aitoearn-backend/apps/aitoearn-ai/src/core/ai/providers/`
- `project/aitoearn-web/src/api/aiProviders.ts`
- `project/aitoearn-web/src/components/SettingsModal/tabs/ProvidersTab.tsx`
- `.compact-ui` in `project/aitoearn-web/src/app/globals.css`

## Provider Architecture

- `Provider` is static registry metadata: capability, category, supported auth modes.
- `ProviderAccount` is per-user, multi-account runtime config: OAuth/API/extension/cookie/builtin relay.
- Credentials are encrypted server-side; frontend only receives `hasCredentials`.
- OAuth and extension accounts are separate auth modes. Do not mix browser session data with OAuth tokens.

## Upgrade Rule

When syncing upstream AiToEarn:

1. keep provider registry as an additive AI module;
2. avoid changing existing `config.ai.models` shape;
3. avoid changing existing social `Account` and `PublishRecord` contracts unless explicitly needed;
4. resolve conflicts in custom files last;
5. run web typecheck and provider API smoke before merging.

## Next Expansion

- Grok OAuth: connect/callback/refresh flow using xAI OAuth.
- Extension automation: browser profile pool, proxy, login health, DOM recipes.
- Workflow runs: step logs, artifacts, retry chain, account routing.

## 2026-07-06 Provider Pool Slice

- Added cookie import, account select, and account health endpoints under `POST /api/ai/providers/accounts/*`.
- Provider auth modes now include `cookie_import` and `cdp_profile`; legacy `cookie` mode is not used for new imports.
- Runtime responses redact `credentialsEnc`; UI only sees `hasCredentials`.
- 9router health uses `host.docker.internal` from the AI container when a local base URL is configured.
- Docker image rebuild is now durable for `aitoearn-ai`: `build-docker.mjs` runs on Windows, emits JS into context after copying dist artifacts, copies `config.js`, and compose uses local `pull_policy: never`.

## 2026-07-06 CDP And Publish Dry-Run Slice

- Added `POST /api/ai/providers/cdp/smoke` as a dry-run guard for Helium/BugLogin/Chrome CDP profiles. It requires local CDP endpoints only and reports manual takeover / wrong-profile checks before any live automation.
- Added `POST /api/ai/providers/social/publish/dry-run` for platform-safe validation before publishing. It validates strategy, caption length, required media, and returns next route without posting.
- Frontend API wrappers exist in `project/aitoearn-web/src/api/aiProviders.ts`; dense UI forms are still pending.

## 2026-07-06 Workflow Executor Slice

- Added `POST /api/ai/providers/workflow-runs/:id/execute` for safe dry-run workflow execution.
- The executor persists `WorkflowStep` rows and completes the `WorkflowRun` with a timeline output.
- Supported dry-run step types: `prompt`, `generate_text`, `generate_image`, `generate_video`, `transform`, `browser_action`, `publish`, `wait`, `approval`, `download`.
- Live side effects remain disabled; publish/browser/provider steps return validation artifacts only.

## 2026-07-06 Live Text Workflow Slice

- Workflow `generate_text` now calls the existing `ChatService` with `cx_agy`, so text generation routes through local 9router and records normal AI usage/log data.
- The workflow remains safety-first: non-text side-effect steps stay dry-run until CDP/profile and publishing routes are explicitly enabled.
- Runtime smoke verified a workflow run producing `OK` from `cx_agy` and persisting completed `WorkflowStep` records.

## 2026-07-06 Compact Provider UI Slice

- Providers tab now loads provider accounts and recent workflow runs together.
- Added compact smoke actions for CDP profile, social publish dry-run, and workflow execution.
- Added last-result JSON panel and recent workflow timeline list.
- Compact editable forms now collect CDP profile data, publish dry-run payloads, and workflow prompts from the app; a full workflow detail drawer is still pending.

## 2026-07-06 CDP Screenshot Artifact Slice

- Added `POST /api/ai/providers/cdp/screenshot` for local-only CDP screenshots.
- The endpoint queries `/json/list`, asserts `expectedHost`, captures PNG via `Page.captureScreenshot`, and returns a `data:image/png;base64,...` artifact.
- Verified with a temporary headless Chrome/Edge profile on `http://localhost:9222` pointed at `https://www.bugsell.com/`; artifact size was ~424 KB.
- Guardrail: non-local CDP endpoints are rejected to avoid wrong-profile / remote-browser automation.

## 2026-07-06 Account Config And CDP Recipe Slice

- Added `sticky_per_workflow` account selection. The same workflow id maps to the same active provider account while cooldown/disabled accounts stay excluded.
- Added compact provider account form in Settings > Providers for 9router/Grok/ChatGPT/Seedance. API keys are sent only to the backend and cleared from the form after save.
- Added compact cookie import form for owned accounts. Imported cookie accounts use `cookie_import`; raw cookies are encrypted and never returned to UI.
- Added `POST /api/ai/providers/cdp/recipe` for local CDP recipe execution with strict `expectedHost` guard.
- Supported recipe steps: `assert_host`, `screenshot`, `click`, `type`, `wait`, `manual_checkpoint`, `evaluate`.
- CDP host headers now follow the requested endpoint port instead of assuming `localhost:9222`.

## Still Open

- Browser extension packaging/install UX is still pending; server bridge contract is implemented.
- Workflow detail drawer with per-step timeline, logs, and artifact preview.
- Live social publish routes remain guarded; current publish endpoint is dry-run validation only.

## 2026-07-06 Extension Recipe And Artifact Slice

- Added `.social-assets` mount for `aitoearn-ai` at `/app/social-artifacts` so SocialOps artifacts survive container recreation.
- CDP screenshots and recipe screenshots now write PNG files under `/app/social-artifacts/socialops` and still return inline previews for UI inspection.
- Added extension recipe import/dry-run endpoints: `POST /api/ai/providers/extension/recipes` and `POST /api/ai/providers/extension/recipes/run`.
- Extension recipes are stored as automation profiles with `settings.mode = extension` and platform/profile metadata.
- Live extension execution is still guarded until a browser-extension bridge is installed; dry-run produces logs and a JSON artifact.
- Providers tab now has a separate Extension Recipe panel, distinct from OAuth/API provider accounts.

## 2026-07-06 Provider Router Retry Slice

- Added `POST /api/ai/providers/accounts/route` to execute provider operations through the account pool.
- Router supports `least_used`, `round_robin`, and `sticky_per_workflow` candidate ordering.
- Retryable statuses are `401`, `429`, and `5xx`; failed accounts move to `expired` or `cooldown` with exponential backoff.
- Successful routes reset `failCount`, clear cooldown, update health, and mark `lastUsedAt`.
- Supported operations now: `health_check` and `generate_text` through existing `ChatService`/9router.
- Providers tab now has a `Route` smoke action beside Save/Select.

## 2026-07-06 Provider Quota Slice

- Provider account `quota` now supports `{ limit, used, window }` with `hour` or `day` reset windows.
- Provider routing excludes accounts whose current `used >= limit`; `limit = 0` disables quota.
- Successful provider routes increment usage from AI usage data when present, falling back to one unit.
- Providers tab shows quota usage and can set quota limit/window while saving accounts.
- Quota is intentionally local/account-scoped; no global billing abstraction added.

## 2026-07-06 Native Extension Bridge Slice

- Added bridge session endpoints: `POST /api/ai/providers/extension/bridge/register` and `POST /api/ai/providers/extension/bridge/heartbeat`.
- Bridge sessions are stored as `ProviderAccount` rows with `authMode = extension`; tokens are encrypted and never listed back.
- Register returns a one-time `bridgeToken` for the browser extension profile.
- Heartbeat validates the bridge token, updates bridge status, last URL, health, cooldown/error state, and keeps OAuth/API accounts separate.
- Providers tab can register a bridge and send a heartbeat using the profile id from the Extension Recipe panel.
- MV3 local extension shell is available at `social-ops/extension`; store publishing remains out of scope.

## 2026-07-06 MV3 Extension Shell Slice

- Added load-unpacked MV3 shell under `social-ops/extension`.
- Popup stores local API base, app JWT, platform, profile id, and one-time bridge token in Chrome extension storage.
- Background worker sends heartbeat to SocialOps and can capture active-tab screenshots.
- Content script exposes basic recipe primitives: `assert_host`, `click`, `type`, `wait`, `read`, and `manual_checkpoint`.
- No build step or store packaging is required; this is intentionally a local-first unpacked extension for owned profiles.

## 2026-07-06 Research Notes

- 9router: selected as first-class local AI gateway because its docs describe an OpenAI-compatible `/v1/*` inference surface and management APIs. Source: https://github.com/decolua/9router/blob/master/docs/ARCHITECTURE.md
- Chrome MV3 extension: selected `storage`, `tabs`, `scripting`, `activeTab`, and `alarms` because Chrome's extension reference lists these APIs/capabilities for MV3 local automation shells. Source: https://developer.chrome.com/docs/extensions/reference
- CDP automation: kept CDP screenshot/evaluate route because the Chrome DevTools Protocol exposes `Runtime` and `Page.captureScreenshot`; local-only endpoint guard reduces wrong-profile risk. Source: https://chromedevtools.github.io/devtools-protocol/
- TikTok publishing: kept API route behind validation and domain checks because official docs require verified URL/domain ownership for `PULL_FROM_URL`; `push_by_file`/draft flows remain safer until review passes. Source: https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide
- Rejected option: direct live social posting via unofficial scraping as the default. Safer default remains OAuth/API when available, otherwise cookie/CDP/extension with manual checkpoints.

## 2026-07-06 Extension Bridge Job Queue Slice

- Added bridge job queue endpoints: `POST /api/ai/providers/extension/bridge/jobs`, `/jobs/next`, and `/jobs/complete`.
- Jobs are stored as `WorkflowRun` rows with `input.mode = extension_bridge_job`, platform, profile id, steps, and settings.
- Bridge polling validates the encrypted bridge token before leasing pending jobs and marks jobs running.
- Completion writes JSON artifacts, logs, final status, and sanitized error text.
- MV3 popup now has `Run Next Job`; background polls `/jobs/next`, sends steps to the content script, then posts `/jobs/complete`.

## 2026-07-10 BugSell production catalog (opt-in)

- Optional BugSell product picker lives in **Content Management** (`draft-box` AiBatchGenerateBar), not Provider Console.
- Provider Console stays integrations-only (providers / connections / 9Router sync). No Automation tab.
- Production only by default: `BUGSELL_API_URL=https://api.bugsell.com`, `BUGSELL_STORE_URL=https://www.bugsell.com`.
- Enable with `BUGSELL_ENABLED=true`. No admin/shop API key for MVP (public storefront browse).
- Local API hosts (`bugsell.test`, localhost) are blocked unless `BUGSELL_ALLOW_LOCAL=true`.
- BFF routes under `/api/local/bugsell/*`: `status`, `products`, `products/[slug]`, `shops`, `shops/[slug]`, `suggestions`.
- Flows: **By product** and **By shop** → select product → fills draft-box generation prompt (+ product chip) → Generate via existing AI batch pipeline.

## 2026-07-06 Practical Flow UI Slice

- Providers tab now has a `BugSell Product Flow` panel for real use: product URL/title/notes, target platform, execution mode, and SEO/video output style.
- Flow modes:
  - `AI workflow only`: generates a 9router SEO/video plan and approval checkpoint.
  - `CDP profile`: generates the SEO plan and stages a guarded CDP recipe.
  - `Extension queue`: queues an extension bridge job for the selected platform/profile.
- This keeps provider config, CDP profile flow, extension automation, and BugSell product-to-SEO-video planning in one dense ops screen.
