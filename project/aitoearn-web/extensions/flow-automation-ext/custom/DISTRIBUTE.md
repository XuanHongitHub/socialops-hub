# Flow Automation — bản phân phối (thuần extension)

User **chỉ cài extension**, không cần SocialOps Hub / app.

## Defaults Settings (đã bake vào pack)

| Setting | Default |
|--------|---------|
| Chế độ mặc định | Text to Video |
| Mô hình | Veo 3.1 - Lite |
| Mô hình hình ảnh | Nano Banana 2 |
| Tỷ lệ khung hình | **9:16** |
| Tùy chọn video | **10s** |
| Chế độ ảnh | Ảnh mới |
| Outputs / prompt | **1** |
| Concurrent prompts (luồng) | **1** (đổi 1–6 trong Control) |
| Max retries | **5** |
| Auto DL video | **1080p** |
| Auto DL image | **1K** |
| Random delay | 20–30s |

Ngôn ngữ UI: theo `navigator.language` (máy user = vi → tiếng Việt).

## Cách đóng gói gửi user

1. Chạy (nếu vừa sync upstream):

```powershell
cd extensions/flow-automation-ext
.\update.ps1 -ApplyOnly
```

2. Nén thư mục (bỏ `custom` nếu muốn gọn — **không bắt buộc** giữ `custom` cho end-user):

```powershell
# Gợi ý: zip cả pack (trừ .git)
Compress-Archive -Path .\* -DestinationPath ..\FlowAutomation-SocialOps-dist.zip -Force
```

3. User cài:

- Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → chọn folder pack  
  hoặc cài CRX nếu bạn đóng gói riêng.

## Lưu ý

- Defaults áp khi **chưa có** `flow_automation_settings` trong storage, hoặc user **Reset Settings**.
- User đã Save settings cũ trên máy → giữ settings cũ. Muốn defaults mới: **Reset Defaults** trong Settings tab.
- Concurrent / delay / outputs: đổi trong Control/Settings của ext, bấm Save (hoặc auto-save).
