# Flow Automation (SocialOps build)

## Pure extension (manual)

1. Chrome → chrome://extensions → Developer mode
2. Load unpacked → this folder
3. Open labs.google Flow project → side panel → add prompts → Run

Defaults: 9:16 · 10s · 1 output · 1 concurrent · retries 5 · 1080p download
- Concurrent Prompts (1–6): tab Control (not Setting)
- Random Delay 25–45s: giây giữa prompt (tránh flag “hoạt động bất thường”)

## Google “hoạt động bất thường”

Flow chặn automation spam (nhiều project / CDP / multi-seat).
- Concurrent = 1; delay 25–45s; 1 seat / account
- Nghỉ 24–48h nếu account bị flag; gen tay 1–2 clip rồi mới auto lại
- Không tạo hàng loạt project mới qua script

## Watermark (visible logo)

Post-process: allenk/VeoWatermarkRemover → GeminiWatermarkTool-Video.exe
  %APPDATA%\\SocialsHub\\tools\\  (scripts\\install-veo-watermark-tool.ps1)
Không gỡ được SynthID ẩn.

## Content management (SocialOps Hub — real path)

Draft-box model: ext:flow:video

Pipeline (not shell-only):
  Hub draft task
    → browser seat CDP online
    → open Flow + submit prompt
    → wait for video (up to ~8 min)
    → extract http URL or blob
    → archive to /api/ai/assets/…
    → material in Draft group
    → task success with videoUrl

Required:
1. SocialOps running (next start -p 6061 / npm run live)
2. Workspace → Prepare primary seat (or Attach CDP) — seat must stay open
3. Login Google on that seat (Flow PRO for Veo)
4. Draft-box → generate with Browser model ext:flow:video
5. Success only when video is archived — open tab alone = fail

Push Hub settings into pack:
  Workspace → Save media defaults (push flow_automation_settings)
