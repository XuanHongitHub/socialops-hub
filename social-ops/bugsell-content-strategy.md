# BugSell Content Strategy: Full Trending - Bao Quát - Trung Tính

Tài liệu này định hình chiến lược nội dung tự động hóa bằng AI cho thương hiệu BugSell, tập trung vào việc đu trend nhanh nhưng giữ vững tính bao quát của danh mục và thẩm mỹ trung tính cao cấp.

---

## 1. Ba Trụ Cột Cốt Lõi (Core Pillars)

### Trụ Cột 1: Full Trending (Bám Trend Tối Đa)
*   **Audio-First:** Thuật toán TikTok/Reels ưu tiên tốc độ phân phối của âm thanh. Phải tìm và chọn Top Rising Audio trên TikTok Creative Center trước khi thiết kế sản phẩm.
*   **Meme-jacking:** Chuyển đổi meme, câu nói viral trên mạng xã hội (Reddit, TikTok, X) thành thiết kế sản phẩm POD trong vòng dưới 24h.
*   **Đón đầu (Predictive):** Lên lịch trước 2 tuần cho các sự kiện văn hóa, thể thao, ngày lễ lớn (Super Bowl, Valentine, Mother's Day) để nhân đôi sức đẩy của thuật toán.

### Trụ Cột 2: Bao Quát (Broad Catalog)
*   **Đa dạng sản phẩm:** Mỗi ý tưởng/trend khi duyệt phải hiển thị đồng bộ trên 3 dòng sản phẩm chủ lực:
    *   Áo thun (Shirt)
    *   Ly giữ nhiệt (Tumbler)
    *   Áo đấu (Jersey)
*   **Cá nhân hóa đơn giản:** Cấu trúc thiết kế mở để dễ dàng thay đổi Tên (Name), Năm sinh (Year), Chức danh (Role), Sở thích (Hobby) hoặc Quan hệ (Relationship).

### Trụ Cột 3: Trung Tính (Neutral & Premium)
*   **Muted-Test (Tắt tiếng vẫn đẹp):** Video không nhạc vẫn phải phô diễn được sản phẩm rõ nét ngay giây đầu tiên.
*   **Visual tối giản:** Nền tĩnh trung tính (Màu trắng, đá, kem, đen). Bố cục sạch sẽ, không chèn sticker hỗn loạn hay chữ nhấp nháy rẻ tiền.
*   **Typography nhất quán:** Sử dụng bộ font chữ cao cấp (Inter, Playfair Display), tối đa 1 dòng text overlay ngắn.
*   **Caption & CTA nhẹ nhàng:** Caption tập trung vào tính quà tặng và phong cách sống. CTA: *"Make it yours"* (Hãy tạo dấu ấn của riêng bạn).

---

## 2. Quy Tắc Loại Trừ (Kill Conditions & Guardrails)

Để bảo vệ hình ảnh thương hiệu cao cấp, tuyệt đối bỏ qua các trend sau:
*   **Chính trị & Tôn giáo:** Bỏ qua 100%.
*   **Thảm kịch & Đau thương:** Không sử dụng các sự kiện tai nạn, tang tóc làm mồi tương tác.
*   **Bản quyền thương hiệu:** Không sử dụng logo đội bóng, nhân vật hoạt hình hoặc câu nói đã đăng ký Trademark.
*   **Chaos Meme:** Không bắt chước các video có visual nhếch nhác, âm thanh quá chói tai.
*   **Giới hạn màu sắc (Color Override):** Chỉ phá lệ dùng màu neon/phá cách khi có trend màu cực mạnh (ví dụ: Brat Green). Tỷ lệ màu trend tối đa 30% khung hình, tự động hết hạn và xóa khỏi template sau 7 ngày, tần suất tối đa 1 lần/tuần.

---

## 3. Bản Thiết Kế 5 Template Mẫu (Week 1)

| Mã | Tên Format | Background | Trọng Tâm Sản Phẩm | Loại Nhạc (Audio) |
|---|---|---|---|---|
| **T1** | Lifestyle Hands | Trắng/Đá | Ly giữ nhiệt (Có tay cầm thật) | Pop Trending |
| **T2** | Flat Lay Premium | Đen/Chevron | Áo đấu Jersey (Gấp phẳng) | Instrumental/Beat |
| **T3** | Clean Wear | Ngoại cảnh tự nhiên | Áo thun (Người mẫu trung lập) | Meme Audio đang lên |
| **T4** | Close-up Print | Kem/Nền trơn | Chi tiết hình in/chất vải | Voice Clip trending |
| **T5** | Gift Reveal | Hộp quà tối giản | Combo Áo + Ly | Nhạc acoustic ấm áp |

---

## 4. Lộ Trình Triển Khai (Roadmap)

### Giai đoạn 1: Manual Sprint (Tuần 1 - Xác thực thủ công)
*   **Mục tiêu:** Sản xuất và đăng **10 video** trong 5 ngày (2 video/ngày), xoay vòng 5 template trên.
*   **Quy trình:** Dựng bằng Canva + CapCut thủ công để kiểm chứng.
*   **KPI quyết định:** Lượt **Saves** (Lưu bài) và **Link clicks** (Click vào shop).
*   **Quy tắc tối ưu:** Vào ngày thứ Tư, ẩn/xóa các video dưới 500 views sau 48h đăng.

### Giai đoạn 2: Automate Render (Tuần 2 - Tự động hóa sản xuất)
*   **Điều kiện kích hoạt:** Có ít nhất 1 template đạt KPI ở Tuần 1.
*   **Cấu trúc code:**
    1.  Scraper cào Top Trending Audio từ TikTok Creative Center mỗi sáng.
    2.  Gọi API `FAL` sinh ảnh mock-up theo template thắng cuộc.
    3.  Chạy script `FFmpeg` render video tự động (ghép nhạc + ảnh sản phẩm + text overlay).
    4.  Tự động lên lịch đăng bài qua API hệ thống.

### Giai đoạn 3: Vận Hành Dual-Speed (Tháng 2+)
*   **Tier-1 (Auto-ship):** Các trend cực hot, điểm rủi ro `<0.3` sẽ tự động thiết kế, render và đăng trong vòng 4h.
*   **Tier-2 (Review Queue):** Các trend trung lập, có nghi vấn bản quyền hoặc hình ảnh phức tạp sẽ xếp hàng chờ người dùng duyệt trên `/en/draft-box`.
