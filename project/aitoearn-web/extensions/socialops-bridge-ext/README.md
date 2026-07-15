# SocialOps Hub MV3 Bridge

Load unpacked from `social-ops/extension`.

1. Open SocialOps Hub > Settings > Providers > Extension Recipe.
2. Select platform/profile, click `Bridge`, copy the one-time bridge token.
3. Open this extension popup, paste API base, app JWT, platform, profile id, and bridge token.
4. Click `Heartbeat`; SocialOps should show the extension provider account as healthy.

Capabilities in this shell:

- Heartbeat to `/api/ai/providers/extension/bridge/heartbeat`.
- Active-tab screenshot via `chrome.tabs.captureVisibleTab`.
- Content-script recipe primitives: `assert_host`, `click`, `type`, `wait`, `read`, `manual_checkpoint`.

Tokens stay in Chrome local extension storage and are never printed by the popup.


## Running queued jobs

1. In SocialOps Hub, click `Queue` in the Extension Recipe panel.
2. Open the target social tab in the same browser profile.
3. Open the extension popup and click `Run Next Job`.
4. The extension leases one pending job for its platform/profile, runs supported content-script steps, and reports completion.
