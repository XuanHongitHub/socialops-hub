# Flow / VEO — stable ops (SocialOps)

## Goals

1. One Google account → one pool seat at a time  
2. Real video file (not shell navigate)  
3. Optional watermark strip after archive  
4. Avoid Flow “hoạt động bất thường”

## Recommended settings

| Setting | Stable value |
|---------|----------------|
| Concurrent prompts | **1** |
| Random delay | **30–60 s** |
| Outputs per prompt | **1** |
| Duration | **6s** for smoke, **10s** product |
| Seats concurrent | **1 job** total across pool |
| Download | silent → `D:\Download\SocialsHub\{seat}` |

## When Google flags unusual activity

1. Stop all automation 24–48h on that account  
2. Manual gen 1–2 clips in Flow UI  
3. Resume with concurrent=1 only  
4. Do not create many projects via CDP  

## Pipeline (stable)

```text
Pool seat chatgpt-N (CDP live)
  → ext:flow:video / pack Run on /project/…
  → wait tiles + <video>
  → download / blob extract (reject gstatic banners)
  → archive
  → GeminiWatermarkTool-Video (if installed)
  → Draft material
```

## Tools

- Watermark: `%APPDATA%\SocialsHub\tools\GeminiWatermarkTool-Video.exe`  
  Install: `scripts/install-veo-watermark-tool.ps1`  
- Silent download + dev mode seats: `scripts/fix-pool-no-download-prompt.mjs`  
- Unpacked packs: `scripts/fix-pool-unpacked-ext.mjs`

## Hub

Job Queue requires `next start -p 6061` with current code (pool seat resolver, flow_cdp_driver, watermark).  
Shell-only bridge jobs (navigate + checkpoint) are **not** success.
