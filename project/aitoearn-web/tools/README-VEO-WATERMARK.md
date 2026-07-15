# Veo / Flow watermark tool (SocialOps)

Visible logo removal after Flow download (not Google SynthID invisible).

## Install

1. Download **Windows** binary from:
   - https://github.com/allenk/VeoWatermarkRemover/releases/latest  
   - File: `GeminiWatermarkTool-Video.exe`

2. Put it here:

```text
%APPDATA%\SocialsHub\tools\GeminiWatermarkTool-Video.exe
```

Or:

```text
project/aitoearn-web/tools/GeminiWatermarkTool-Video.exe
```

3. Optional env:

```text
SOCIALOPS_VEO_WATERMARK_TOOL=C:\path\to\GeminiWatermarkTool-Video.exe
SOCIALOPS_VEO_WATERMARK_DISABLE=1   # skip post-process
```

## Pipeline

```text
Flow gen → archive mp4 → [optional] GeminiWatermarkTool-Video → loudnorm → Draft material
```

## Flow “unusual activity” (Google ban soft)

If Flow shows: *“Chúng tôi nhận thấy có hoạt động bất thường”*:

- Stop multi-seat spam / concurrent Run for 24–48h on that Google account  
- Prefer **1 seat**, **1 concurrent**, delay 25–45s  
- Reuse one project — don’t create 10 projects via CDP  
- Use **Cloak** + real mouse delay; avoid pure CDP submit storms  
- Login once manually, gen 1–2 videos by hand, then resume automation slowly  

## License

Upstream MIT — https://github.com/allenk/VeoWatermarkRemover  
Keep attribution if redistributing binaries.
