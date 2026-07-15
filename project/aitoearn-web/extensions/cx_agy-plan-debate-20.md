# Debate Plan Ext Integration — Grok × cx_agy

Updated: 2026-07-14T11:10:20.0330504+07:00
Rounds completed: 20 / 20

## Vòng 1 — GROK

# Vòng 1 — GROK (mở)

## Thesis
Plan 3 trụ: (1) BugSell optional context (2) Ext = models theo niche (3) Multi-profile primary+pool với ext + login status. Build trên WorkspaceProfile + draft-box, không greenfield.

## UI/UX claim
User Content Management chỉ thấy **Models** (API vs Browser), không thấy "Chrome user-data-dir". Profile ops chìm trong Workspace (power user). Progressive disclosure: gen path đơn giản, seat ops phức tạp.

## Logic claim
Primary seat mặc định; pool chỉ khi busy/rate-limit. Login = detect + reuse, không auto-bypass. Grok video giữ API; ext là fallback/parallel.

## Thách thức cho bạn
1) Progressive disclosure này có làm user "không biết tại sao gen fail (need login)" không?
2) Model list trộn API + Browser có phá mental model "model = LLM" không?
3) Phase 1 primary+pool cùng lúc vs chỉ primary — trade-off ship?
Phản biện mạnh. Đừng rubber-stamp.

---

## Vòng 1 — CX_AGY

### A. Đồng ý có điều kiện

- Progressive disclosure đúng. Trạng thái đăng nhập phải nổi tại điểm chạy.
- API + Browser cùng catalog được. Nhãn “Models” sai nếu capability khác nhau.
- Primary-first đúng. Pool Phase 1 chưa đáng nếu bridge web còn stub.
- BugSell optional đúng. Context phải explicit, không âm thầm ảnh hưởng output.
- Grok video API primary. Browser fallback chỉ sau khi chứng minh API thiếu capability.

### B. Phản biện / risk

**1. Login chìm gây fail khó hiểu**

- “Need login” sau Submit là UX lỗi.
- Detect login không đủ. Session có thể stale, challenge, consent, CAPTCHA, quota.
- Primary “luôn login” là giả định vận hành, không phải invariant.
- Retry sang pool khi rate-limit dễ tạo vòng lặp, duplicate generation, vi phạm policy.
- Browser đóng, extension crash, profile locked, version lệch: cùng bị báo chung “login failed” sẽ phá trust.

**Yêu cầu UI**

- Preflight trước chạy: `Ready / Login required / Busy / Rate-limited / Unavailable`.
- Block Submit khi không có route khả dụng.
- CTA trực tiếp: `Open browser to sign in`.
- Job timeline lộ route đã chọn, lỗi cụ thể, retry policy.
- Không lộ `user-data-dir`; vẫn phải lộ “Browser seat: Primary”.

**2. “Models” trộn API + Browser phá mental model**

- Có. Browser không phải model; là execution route.
- Cùng model, khác route, latency, reliability, quota, privacy, capability.
- Nếu list có “Grok API” cạnh “Grok Browser”, user hiểu thành hai model khác nhau.
- Better taxonomy:
  - **Capability**: Chat, Image, Video.
  - **Provider/model**: Grok, Gemini…
  - **Connection**: API, Browser.
- Default picker chỉ hiện outcome. Route chọn tự động.
- Advanced mở “Connection preference”, không mở profile internals.

**3. Primary + pool Phase 1**

- Không nên.
- Pool kéo theo scheduler, lease, profile locking, health, fairness, concurrency, retry idempotency, observability, account ownership, seat permissions.
- Bridge jobs còn stub. Pool lúc này nhân bản failure surface trước khi có đường chạy ổn định.
- “Fallback khi busy/rate-limit” nguy hiểm: busy kỹ thuật khác quota/account restriction. Không được xử lý như nhau.

### C. Best practice

- **Linear/Vercel**: happy path mặc định; trạng thái connection đặt sát action; lỗi có remediation.
- **Browserbase/Playwright fleets**: session lease, health check, concurrency cap, deterministic cleanup; không chọn profile ngẫu nhiên.
- **Multi-tenant seats**: seat thuộc workspace; RBAC; audit log; quota; owner; không dùng chung primary mơ hồ.
- **Progressive disclosure**: ẩn cấu hình, không ẩn trạng thái, tác động, recovery.
- **Routing**: capability-first; provider/connection là policy. Persist route thực tế trên job.
- **Retries**: chỉ retry lỗi transient; idempotency bắt buộc; auth/CAPTCHA cần người xử lý.

### D. Chỉnh plan

**Phase 1: primary only**

1. Hoàn thiện một bridge job end-to-end.
2. Browser seat state machine tối thiểu: `Ready`, `Needs login`, `Busy`, `Blocked`, `Offline`.
3. Preflight ngay trong composer.
4. Manual login handoff. Không auto-bypass.
5. Một job, một lease, một retry transient.
6. API/Browser hiển thị dưới “Connection”, không ngang cấp model.
7. Grok video API mặc định. Browser opt-in beta, không fallback âm thầm.
8. BugSell context có chip nguồn, preview, remove, provenance.

**Phase 2: pool**

- Chỉ mở sau telemetry primary:
  - queue wait đáng kể;
  - tỷ lệ transient rõ;
  - nhu cầu concurrency thật;
  - bridge success ổn định.
- Pool cần lease lock, health score, per-seat concurrency, cooldown, audit, workspace ownership.
- Không tự đổi account khi auth/rate-limit nếu user chưa cho phép.
- Auto-routing phải hiện trước: “May use another workspace seat”.

### E. Câu hỏi ép phía Grok

1. “Busy” định nghĩa từ lock nội bộ hay trạng thái provider?
2. Rate-limit thuộc model, account, IP, browser session hay workspace? Bằng chứng?
3. Pool seat thuộc ai? Ai được xem, dùng, đăng xuất?
4. Job chuyển seat có giữ idempotency, prompt privacy, file uploads?
5. CAPTCHA/challenge xử lý UI nào? Timeout bao lâu?
6. Browser fallback có cần user consent mỗi job hay workspace policy?
7. Extension version drift được detect, pin, rollout, rollback thế nào?
8. “Login detected” chứng minh capability usable bằng probe nào?
9. Nếu primary chết giữa generation, resume được hay tạo job mới?
10. Chỉ số nào buộc Phase 2 pool? Nếu chưa có ngưỡng, pool là speculative complexity.

---

## Vòng 2 — GROK

# Vòng 2 — GROK (trả lời 10 câu ép + pushback)

## Consensus shift (tôi nhận)
1) Phase 1 = **primary only** — đồng ý. Pool Phase 1 là speculative complexity khi bridge còn stub.
2) Preflight + block Submit khi không Ready — đồng ý tuyệt đối. Progressive disclosure ẩn config, **không** ẩn trạng thái.
3) Taxonomy Capability → Provider → Connection — đồng ý. Nhãn "Models" lẫn API/Browser là sai.
4) Browser fallback âm thầm — cấm. Browser = opt-in / policy, không silent failover từ API.

## Trả lời E1–E10 (đóng ambiguity)

| # | Quyết định |
|---|------------|
| 1 Busy | **Lock nội bộ seat** (job lease) + CDP process alive. Không dùng "busy" provider web (không quan sát được tin cậy). |
| 2 Rate-limit | Tách 4 bucket: `api_quota`, `account_soft_block`, `session_challenge`, `ip_proxy`. Chỉ auto-retry `api_quota` transient + backoff. Challenge/CAPTCHA = Needs human. |
| 3 Pool ownership | Seat thuộc **workspace local SocialOps** (single-tenant desktop trước). Phase 2 mới RBAC. Primary = workspace default seat. |
| 4 Idempotency | `jobId` stable; seat switch chỉ nếu job chưa `running_provider`; uploads hash-bound to jobId. Privacy: pool seats same trust domain workspace. |
| 5 CAPTCHA UI | Modal non-blocking job: "Complete challenge in browser" + Open seat + poll 15m + cancel. Không auto-solve. |
| 6 Browser consent | Workspace policy: `browser_allowed: off|ask|on`. Default `ask` lần đầu / `off` cho video production. |
| 7 Ext drift | Pin `manifest.version` + hash assets; preflight mismatch → Unavailable + "Update pack". Sync qua update.ps1 manual/UI, không hot-patch mid-job. |
| 8 Login probe | Tầng: cookie presence → navigate host → DOM/url heuristic → optional ext heartbeat. Status: Ready chỉ khi probe pass **và** last probe < TTL (15m). |
| 9 Mid-fail | Không silent resume khác seat. Job = failed_partial + artifact nếu có; user Retry (same seat) hoặc Retry other seat (Phase 2). |
| 10 Phase 2 gate | Metrics: p95 queue wait > 120s **và** bridge success ≥ 95% **và** ≥ N concurrent demand 7 ngày. Không có threshold → không pool. |

## Pushback (tôi không hoàn toàn theo bạn)
- **"Default picker chỉ hiện outcome, route tự động"**: nguy hiểm với video product — user **cần** biết API vs Browser (watermark, fidelity, cost, duration). Đề xuất: default **Capability+Provider** (Grok Video), Connection hiện **1 dòng status** dưới picker ("via API · Ready" / "Browser · Needs login"), Advanced mới đổi connection.
- **Pool "không tự đổi account khi rate-limit"**: đúng cho auth; nhưng soft API rate-limit trên **cùng** provider multi-OAuth seat (đã có Grok pool) khác browser seat — đừng gộp policy.

## UI wire (Phase 1 concrete)
Composer:
1. Product chip BugSell (optional, removable, provenance)
2. Capability tabs: Video | Image | Chat
3. Provider card: Grok / ChatGPT / Gemini / Flow (filter by capability)
4. Connection strip: API | Browser (disabled + tooltip nếu unsupported)
5. Seat pill: Primary · Ready|Needs login|… + CTA
6. Submit disabled nếu preflight fail

## Thách CX_AGY
1) Connection strip cạnh Provider có đủ "honest" không, hay vẫn gộp nhầm model?
2) TTL login 15m quá ngắn/dài cho desktop single-user?
3) BugSell provenance: chip đủ hay bắt buộc "product context applied" banner khi prompt inject?

---

## Vòng 2 — CX_AGY

## A. Đồng ý có điều kiện

- **Consensus shift:** chấp nhận Connection hiện ở default view. Video có chênh lệch cost, watermark, fidelity, duration. Route ảnh hưởng outcome.
- Connection strip đủ honest nếu hiển thị **hệ quả**, không chỉ transport.
- TTL 15m hợp cho cache nền. Không hợp nếu mỗi Submit bắt user chờ probe.
- BugSell chip đủ khi chỉ chọn context. Không đủ khi context thực sự inject.
- Phân biệt API multi-OAuth routing với browser pool: đúng. Policy, lease, lỗi phải tách.

## B. Phản biện / risk

### 1. Connection strip

- `API | Browser` cạnh Provider vẫn dễ bị hiểu như model variant.
- Strip ngang tạo cảm giác lựa chọn tương đương. Thực tế capability, giá, output khác.
- Disabled + tooltip yếu: mobile, keyboard, accessibility, discoverability kém.
- Seat pill Phase 1 dư. Chỉ một Primary; pill tạo affordance chọn seat giả.
- `Flow` có thể là product/workflow, không đồng cấp Provider. Taxonomy cần xác minh.
- Preflight fail không nên luôn block Submit:
  - Route đã chọn fail: block.
  - Route khác available: đề nghị đổi, không tự đổi.
  - Browser `Needs login`: CTA.
  - Probe stale: kiểm tra lại, chưa kết luận fail.

### 2. TTL 15m

- TTL duy nhất sai abstraction.
- Cookie probe rẻ nhưng yếu. Navigation/DOM probe đắt, gây focus, network, anti-bot.
- Session có thể chết sau 10 giây. TTL 15m không bảo đảm readiness.
- Poll CAPTCHA 15 phút dễ tạo background automation noise.
- `CDP process alive` chỉ là transport health, không phải seat usability.

### 3. BugSell provenance

- Chip chỉ chứng minh selection. Không chứng minh injection.
- Banner thường trực tạo banner blindness, chiếm composer.
- Context có thể stale, quá dài, chứa secrets, prompt injection.
- “Optional” nhưng auto-inject khi chip còn gắn cần preview rõ.
- Provenance phải tồn tại trên job/result, không chỉ trước Submit.

### 4. API multi-OAuth

- “Cùng provider” không đồng nghĩa cùng trust/cost/quota domain.
- Auto-switch OAuth account có thể đổi billing, retention, entitlement.
- `api_quota transient` cần `Retry-After` hoặc mã lỗi xác định. Không suy đoán từ text.
- Phase 1 primary-only đang bị lách nếu Grok API pool vẫn tự route nhiều OAuth seat.

## C. Best practice

- **Connection row:** `Connection: API — Ready` + summary `~$X · 10s · no watermark`.
- Browser: `Browser — Login required` + `May differ from API output`.
- Dùng radio/list, không segmented strip nếu option có mô tả dài.
- Không tooltip-only. Disabled option kèm inline reason.
- Preflight hai tầng:
  - Passive cache khi mở composer.
  - Active probe khi chọn Browser, app resume, trước dispatch nếu stale.
- TOCTOU chấp nhận: dispatch vẫn revalidate; lỗi auth trả remediation.
- BugSell:
  - Chip = source selected.
  - Inline disclosure = applied state.
  - Expand = exact fields/context preview.
  - Result metadata = source snapshot/version.
- API account routing:
  - Explicit policy.
  - Same billing/trust group.
  - Bounded retry.
  - Audit route.
  - Không browser crossover.

## D. Chỉnh plan

### Composer Phase 1

1. Capability tabs.
2. Provider/model card. Xác minh `Flow` trước khi xếp Provider.
3. Connection section:
   - `API — Ready · estimated cost/duration/output traits`
   - `Browser — Needs login · Open browser`
4. Bỏ Seat pill khỏi normal view.
5. Advanced/status drawer: `Primary`, last checked, extension version, retry probe.
6. Submit:
   - route ready: enabled;
   - probing: disabled ngắn + progress;
   - auth/challenge: disabled + CTA;
   - alternative ready: `Switch to API`, không auto-switch.
7. Dispatch revalidate, acquire lease atomically.
8. Job lưu `provider`, `model`, `connection`, `seatId`, probe timestamp, BugSell snapshot.

### TTL

- Passive freshness: 15m.
- Probe khi app resume hoặc connection đổi.
- Active check trước Browser dispatch nếu cache >2m.
- Không navigation probe liên tục.
- CAPTCHA poll adaptive hoặc user-triggered `Check again`; dừng khi browser đóng/job cancel.
- TTL cấu hình: YAGNI. Hardcode trước, telemetry rồi đổi.

### BugSell

- Chip: `BugSell: Product A`.
- Khi inject: inline line `Product context applied · View`.
- Không banner toàn chiều rộng.
- Preview field-level; remove trước Submit.
- Snapshot khi tạo job. Result giữ provenance.
- Secret filtering tại trust boundary. Không gửi hidden fields mặc định.

### API pool boundary

- Phase 1: một API credential route mỗi workspace/provider.
- Nếu multi-OAuth đã tồn tại: giữ manual account selection hoặc policy hiện hữu; không thêm scheduler mới.
- Phase 2 tách:
  - API credential pool.
  - Browser seat pool.
- Metrics, consent, error taxonomy riêng.

## E. Câu hỏi ép Grok

1. `Flow` là provider, model, workflow hay browser product?
2. API/Browser khác watermark, giá, duration cụ thể từ nguồn nào? UI lấy metadata ở đâu?
3. Browser preflight có mở tab/focus ngoài ý user không?
4. Dispatch lock atomically ở DB/file lock hay chỉ memory? App crash giải lease thế nào?
5. `Ready` có nghĩa auth usable hay chỉ probe pass? Label nào tránh hứa quá mức?
6. BugSell inject field nào? User xem exact payload được không?
7. Snapshot BugSell lưu dữ liệu hay chỉ ID? Product sửa/xóa sau job thì audit ra sao?
8. Secret/PII filtering nằm trước draft-box hay trong adapter từng provider?
9. Multi-OAuth Grok hiện đã production hay mới plan? Nếu plan, lý do không cắt khỏi Phase 1?
10. `N concurrent demand` là số nào? Không chốt N, gate Phase 2 vẫn chưa kiểm chứng.

---

## Vòng 3 — GROK

# Vòng 3 — GROK (logic flow end-to-end + failure matrix)

## Flow chuẩn Phase 1 (single primary)

```
Select product? → Select capability → Select provider
  → Resolve connection (policy + availability)
  → Preflight seat (if browser) OR preflight API seat
  → Create job (immutable input snapshot + product provenance)
  → Execute (one route)
  → Artifact → draft asset
  → Terminal status + remediation
```

## Failure matrix (UI + logic)

| Failure | User sees | Action | Auto? |
|---------|-----------|--------|-------|
| Needs login | Seat red + CTA Open browser | Hand-login + Re-check | No |
| Challenge | Modal + Open browser | Human | No |
| API quota | Toast + wait/backoff | Retry later | Yes limited |
| Ext crash | Unavailable + report | Relaunch seat | Semi |
| CDP offline | Offline | Start browser seat | Semi (button) |
| Probe stale | Checking… | Re-probe | Yes |
| Product image missing | Warning chip | Continue without / pick image | No block if optional |

## Đồng ý / chỉnh từ vòng 2 CX (giả định bạn siết Connection UX)
- Input snapshot immutable: **bắt buộc** (prompt, product, route, seatId, extVersion).
- Không partial auto-upgrade connection mid-job.

## Tranh luận sâu: API vs Browser cho Grok video
Vị trí Grok:
- **Default API** (đã ship, deterministic enough, multi-seat OAuth).
- Browser path = **parity experiments** (storyboard multi-ref web) + khi API thiếu surface (chat-web-only features).
- Không marketing Browser là "better quality" nếu chưa benchmark.

## Thách
1) Job immutable snapshot có làm UX "edit prompt while queued" tồi không? Cancel+recreate?
2) Flow/Veo ext có nên **ẩn** Phase 1 (chỉ Grok+ChatGPT+Gemini) để giảm surface?
3) Primary seat launch: app-owned user-data-dir vs reuse Chrome Profile 6 — security vs convenience?

---

## Vòng 3 — CX_AGY

## A. Đồng ý có điều kiện

- **Consensus shift:** flow end-to-end đạt khung Phase 1.
- Snapshot immutable đúng sau dispatch. Trước dispatch không cần đóng băng quá sớm.
- Grok API default đúng. Browser gắn `Experimental`, chỉ hiện khi capability web-only.
- Flow/Veo ext ẩn nếu chưa có một đường chạy hoàn chỉnh.
- Primary dùng app-owned profile. Reuse `Chrome Profile 6` không nên là mặc định.
- Failure matrix đúng hướng. Toast cho quota sai vì trạng thái có thể kéo dài.

## B. Phản biện / risk

### 1. Immutable job và edit queued

- Cancel+recreate làm mất queue position, lịch sử, quota reservation.
- Sửa trực tiếp snapshot phá audit, idempotency, reproducibility.
- Phân biệt:
  - `draft`: mutable.
  - `queued`, chưa lease: replace bằng revision mới.
  - `leased/running_provider`: immutable; cancel rồi duplicate.
- User không cần biết “recreate”. CTA: `Update queued job`.
- Job ID giữ hay đổi: nên đổi execution ID; liên kết cùng `draftId/revision`.
- Artifact không nên vào draft nếu job `failed_partial` trừ khi user chọn giữ.

### 2. Failure matrix

- `API quota` không nên Toast đơn độc. Job phải hiện `Waiting until 14:32` hoặc `Retry`.
- Auto-retry chỉ khi server cho `Retry-After` hoặc lỗi typed. Jitter, giới hạn lần, cancel được.
- `Ext crash → Relaunch seat` có thể mất form/state web. Chỉ relaunch khi chưa `running_provider`; khi đang chạy, đánh `failed_partial`.
- `Challenge modal non-blocking` mâu thuẫn ngôn ngữ. Modal chặn UI; dùng persistent job card/banner.
- `Seat red` quá phụ thuộc màu. Icon, text, CTA, ARIA.
- Product image “optional” phải theo capability. Multi-reference yêu cầu ảnh thì block.
- “Preflight API seat” sai mental model nếu API OAuth credential không phải browser seat. Gọi `API connection/account`.
- `Artifact → draft asset` cần explicit commit. Không để retry tạo asset trùng.

### 3. Ẩn Flow/Veo

- Nên ẩn khỏi production UI.
- Không chỉ disabled. Disabled catalog gây kỳ vọng, support load.
- Dev flag đủ cho experiment.
- Tuy nhiên “chỉ Grok+ChatGPT+Gemini” vẫn quá rộng nếu từng provider chưa pass capability contract.
- Ship theo working capability, không theo logo count.

### 4. Chrome Profile 6

- Reuse profile đang mở gây profile lock, cookie exposure, extension collision, history/password access.
- CDP attach vào personal Chrome mở trust boundary quá lớn.
- Profile path dễ đổi theo máy; “Profile 6” không có semantic identity.
- App-owned profile vẫn chứa session nhạy cảm. Cần filesystem permissions, explicit logout/reset, backup exclusion.
- Không copy Chrome profile. Copy có nguy cơ cookie encryption mismatch, corruption, secret sprawl.

## C. Best practice

### Job revision

- Composer lưu `draft`.
- Submit tạo immutable `jobRevision`.
- Queued edit tạo revision mới, supersede revision cũ atomically.
- Running edit tạo job mới; job cũ tiếp tục hoặc user cancel.
- Artifact ghi bằng unique key `(jobId, artifactIndex)`.
- Retry:
  - Same immutable input: `attempt + 1`.
  - Prompt đổi: revision mới, không gọi retry.

### Capability gating

- Registry chỉ chứa route đã pass:
  - preflight;
  - submit;
  - status;
  - artifact retrieval;
  - typed failure;
  - cancel semantics.
- Experimental route nằm dev/beta flag.
- Browser badge: `Experimental`, không “fallback”.

### Profile isolation

- App-owned Chromium profile per workspace/seat.
- OS user permissions.
- Không lưu password qua app.
- User đăng nhập trực tiếp trên provider page.
- `Reset seat` xóa profile cần xác nhận rõ.

**Cảnh báo:** Xóa hoặc reset app-owned browser profile sẽ xóa cookies, phiên đăng nhập, local storage của seat. UI phải yêu cầu xác nhận, liệt kê provider bị đăng xuất, không xóa profile Chrome cá nhân.

## D. Chỉnh plan

### State model tối thiểu

```text
draft
queued
leased
running_provider
awaiting_human
succeeded
failed
failed_partial
cancelled
superseded
```

- `draft`: editable.
- `queued`: cho `Update`; tạo revision mới, old `superseded`.
- `leased+`: immutable.
- `awaiting_human`: lease có TTL; không giữ lock vô hạn.
- Terminal: remediation + route metadata.

### UI

- Composer: `Update queued job` nếu job chưa lease.
- Running: `Cancel run`, `Duplicate and edit`.
- Quota: inline job status, không chỉ Toast.
- Challenge: persistent panel; `Open browser`, `Check again`, `Cancel`.
- Product chip:
  - `Applied` khi snapshot chứa context.
  - `Missing image` nếu field thiếu.
  - Block chỉ khi selected route yêu cầu ảnh.
- Connection label:
  - `API account`, không `API seat`.
  - `Browser seat: Primary`.
- Artifact: preview trước; `Add to draft` explicit. Có thể auto-add chỉ nếu user bật policy rõ.

### Scope Phase 1

1. Grok Video API production.
2. Một browser route duy nhất nếu có web-only capability đã chạy end-to-end.
3. ChatGPT/Gemini chỉ hiện capability thực sự operational.
4. Flow/Veo extension dev flag; xóa khỏi production catalog.
5. App-owned profile duy nhất.
6. Không import/reuse personal Chrome profile.
7. Multi-OAuth API giữ subsystem riêng; không gọi là primary browser pool.

## E. Câu hỏi ép Grok

1. Edit queued atomically thế nào nếu worker acquire lease đúng lúc user bấm Update?
2. `awaiting_human` giữ lease bao lâu? App restart phục hồi challenge ra sao?
3. API quota auto-retry có `Retry-After` thật hay đang parse message text?
4. Multi-OAuth route được snapshot bằng stable credential ID hay email/token?
5. Route registry có capability contract machine-readable hay hardcode UI?
6. ChatGPT/Gemini hiện hoàn tất submit, poll, artifact, cancel chưa? Nếu chưa, vì sao xuất hiện Phase 1?
7. Browser job xác định provider đã bắt đầu chạy bằng signal nào để cấm relaunch?
8. Artifact duplicate prevention nằm DB constraint hay app logic?
9. App-owned profile đặt ở đâu, permission gì, có bị cloud backup/indexing không?
10. Có requirement thật cho reuse `Chrome Profile 6` không? Nếu chỉ để tránh login một lần, trade-off bảo mật không đáng.

---

## Vòng 4 — GROK

# Vòng 4 — GROK (UI surfaces map + IA)

## Information architecture

**A. Content Management (draft-box)** — 80% time
- Capability-first gen
- Connection status strip (not full seat manager)
- BugSell optional chip
- Job mini-timeline (queued → running → done/fail)

**B. Workspace** — 15% time
- Seat health, Open browser, Install/update ext packs, Probe login, CDP smoke
- Activity log
- Policy: browser_allowed, default connection

**C. Providers** — 5%
- API keys / OAuth seats (Grok device login, 9router)
- Không trộn Chrome profile ops vào đây

## Anti-patterns cấm
- Toast-only errors không remediation
- Dropdown 20 "models" gồm cx_agy + grok-imagine + "Grok Browser Video" ngang hàng không group
- Silent pool hop
- Auto-inject BugSell text không chip

## Component states (seat pill)
`unknown → probing → ready | needs_login | busy | blocked | offline | drift`

Microcopy:
- needs_login: "Sign in to Grok in browser"
- drift: "Extension update required"
- blocked: "Account limited — open provider"

## Push: one-click "Prepare Primary Seat"
Wizard 4 steps: Create profile dir → Launch Chrome+exts → Open login tabs → Probe all → Done.
Đây là onboarding, không phải mỗi job.

## Thách
1) Wizard onboarding có nên block first browser gen cho đến khi Ready?
2) Multi-capability probe (4 platforms) song song hay sequential để tránh tab storm?
3) Có cần "Demo mode" dry-run không browser?

---

## Vòng 4 — CX_AGY

## A. Đồng ý có điều kiện

- IA A/B/C hợp lý. Chrome ops chỉ ở Workspace.
- **Consensus shift:** onboarding wizard đáng làm nếu Browser Phase 1 thật sự ship.
- Browser generation phải block đến khi **route được chọn** Ready; không cần toàn seat/all providers Ready.
- Probe sequential mặc định. Parallel chỉ cho kiểm tra không mở tab/navigation.
- Demo mode không cần trong product Phase 1. Cần preflight self-check cho dev/support.
- Seat pill trong Composer chỉ hiển thị route hiện tại; không thành seat manager.

## B. Phản biện / risk

### Wizard

- “One-click” sai kỳ vọng. Login/challenge cần người dùng; gọi `Prepare browser`.
- “Probe all” tạo setup thừa, tab storm, anti-bot, login confusion.
- Không block API generation vì Browser chưa setup.
- Không ép setup Browser khi `browser_allowed=off`.
- Wizard 4 bước đang lộ implementation: `Create profile dir`, `CDP`, ext pack.
- Partial setup phải resumable. App crash không được tạo profile mồ côi.
- Extension install/update có thể cần relaunch. Không hứa một lượt.
- “Done” không đồng nghĩa mọi provider Ready. Cần kết quả từng connection.

### State model

- `busy` không cùng loại với health:
  - health: `unknown|probing|ready|needs_login|blocked|offline|drift`
  - availability: `idle|leased`
- Gộp sẽ gây trạng thái mất thông tin: extension drift trong lúc busy.
- `blocked` quá mơ hồ: soft block, policy denied, challenge khác remediation.
- `ready` có TTL; UI phải hiện `Checked 3m ago`, không hứa tuyệt đối.
- Seat-level state chưa đủ. Login/provider readiness phải theo `seatId + provider + capability/route`.

### IA

- Workspace “Probe login” và “CDP smoke” là ngôn ngữ nội bộ. UI: `Check connection`, diagnostics mới lộ chi tiết.
- Activity log cần giới hạn dữ liệu. Không log token, cookie, full prompt mặc định.
- `default connection` global quá thô. API/Browser availability khác theo capability/provider.
- Providers chứa “OAuth seats” dễ tái tạo nhầm taxonomy. Dùng `API accounts`; dành `seat` cho Browser.
- `9router` cần xác định là provider/aggregator/connection; không xếp chỉ theo implementation hiện tại.

### Demo mode

- Demo giả `Ready` dễ che lỗi integration.
- Dry-run không Browser không kiểm chứng CDP, extension, auth, DOM.
- Product toggle tăng support matrix, persistence, analytics pollution.
- Nhu cầu sales/demo nên dùng fixture riêng, badge rõ, không trộn production jobs.

## C. Best practice

- Setup theo nhu cầu: chỉ prepare provider/route user vừa chọn.
- Passive probes song song: process, port, extension heartbeat, cached auth.
- Active navigation probes: sequential, một tab tái sử dụng, timeout, cancel.
- Login tabs: mở từng provider theo CTA; không mở bốn tab tự động.
- State tách:
  - `seatHealth`
  - `leaseState`
  - `providerAuth`
  - `extensionCompatibility`
- Composer aggregate thành một status + remediation.
- Wizard resumable, idempotent:
  1. Prepare isolated browser.
  2. Verify extension.
  3. Sign in selected provider.
  4. Check connection.
- Dev/support self-check xuất sanitized report; không tạo job/artifact.
- Accessibility: status không chỉ màu; live region cho probe; focus sang CTA lỗi.

## D. Chỉnh plan

### Onboarding

- CTA: `Set up browser connection`.
- Trigger khi user lần đầu chọn Browser.
- API path luôn dùng được độc lập.
- Chỉ block Submit của route Browser đang chọn.
- Wizard không setup bốn platform:
  1. Tạo/mở app-owned profile.
  2. Kiểm tra ext đúng route.
  3. Mở login cho provider đã chọn.
  4. Probe provider/capability đó.
- Kết quả: `Grok Browser ready`; không `Primary Seat ready` chung chung.
- Cho `Exit setup`; giữ tiến độ; cleanup profile chỉ qua Reset có xác nhận.

### Probe scheduling

1. Chạy passive checks song song.
2. Nếu passive fail: dừng, remediation.
3. Chạy active provider probes sequential.
4. Reuse một controlled tab nếu an toàn.
5. Dừng sau route cần thiết đã Ready.
6. `Check all` chỉ ở Workspace diagnostics, explicit.
7. Rate-limit concurrency `1`; không thêm scheduler tổng quát.

### UI states

```text
seatHealth: unknown | probing | online | offline
leaseState: idle | leased
providerAuth: unknown | ready | needs_login | challenge | limited
extension: ready | missing | drift | crashed
```

- Composer mapping:
  - `Checking…`
  - `Ready · checked Xm ago`
  - `Sign-in required`
  - `Challenge requires attention`
  - `Extension update required`
  - `Browser unavailable`
  - `In use · job #…`
- `blocked` xóa khỏi user-facing state; thay lỗi typed.

### Demo/dry-run

- Không ship Demo mode.
- Thêm `Run connection check` tại Workspace:
  - không submit provider generation;
  - không tạo production job;
  - kiểm tra process/CDP/ext/auth route;
  - sanitized diagnostic result.
- Test fixtures chỉ dev flag/build. Watermark `Simulated`; analytics tách hoàn toàn.

## E. Câu hỏi ép Grok

1. Browser Phase 1 có web-only capability bắt buộc thật không? Nếu không, xóa wizard khỏi Phase 1.
2. Wizard setup provider nào trước? Vì sao “Probe all” cần tồn tại?
3. Ext pack là một extension đa provider hay bốn extension? Permission từng pack?
4. Active probe có navigation side effect, mở chat mới, tiêu quota không?
5. Một controlled tab reuse có làm mất draft/provider state đang chạy không?
6. State persistence nằm DB hay suy ra runtime sau restart?
7. Lease đang chạy có cấm update extension/reset profile bằng DB constraint không?
8. Activity log retention bao lâu; redaction prompt, URL query, account identity thế nào?
9. `default connection` có scope `workspace + capability + provider` không?
10. Ai cần Demo mode: sales, QA, onboarding hay end-user? Nếu không có owner/use case, cắt.

---

## Vòng 5 — GROK

# Vòng 5 — GROK (BugSell deep + consensus mid-check)

## BugSell rules (đề xuất đóng)
1. Optional everywhere.
2. Selecting product = structured context object, không chỉ concat title vào prompt.
3. UI: chip + expandable "What will be sent" (title, url, image thumb, notes).
4. Browser jobs: product image may map to upload step **only if** capability needs visual ref; else text context only.
5. API Grok video: product image → existing I2V hero path (commercial prompt).
6. Removing chip = strip context from next job; queued jobs giữ snapshot.

## Conflict
CX muốn provenance rõ. Grok muốn zero friction commerce. Giải: chip luôn visible khi applied; expand mặc định collapse; first-time tooltip.

## Mid-consensus checklist (đánh dấu)
- [x] Phase1 primary only
- [x] Preflight block submit
- [x] No silent browser fallback
- [x] Capability→Provider→Connection
- [x] Browser opt-in policy
- [x] Immutable job snapshot
- [ ] App-owned profile vs Profile 6
- [ ] Which providers Phase1
- [ ] Probe TTL
- [ ] Wizard hard-gate

## Thách chốt nửa đầu
Chọn **một** recommendation cứng cho: (1) app-owned primary dir (2) Phase1 providers set (3) probe TTL (4) wizard hard-gate yes/no.
Không được "tùy". Phải pick.

---

## Vòng 5 — CX_AGY

## A. Đồng ý có điều kiện

- **Consensus shift:** BugSell rules chấp nhận.
- Structured context đúng. Adapter route quyết định serialization.
- Chip collapsed đúng zero-friction. Tooltip chỉ onboarding, không thay provenance.
- Queued snapshot giữ nguyên đúng. UI phải báo: `Changes apply to future jobs`.
- “Optional everywhere” sửa thành: optional ở composer; route I2V vẫn cần image input. BugSell không bắt buộc, visual input có thể bắt buộc.

## B. Phản biện / risk

- `notes` có thể chứa PII, secrets, prompt injection. Không gửi mặc định mù.
- URL có tracking params/token. Phải sanitize trước snapshot.
- “What will be sent” phải phản ánh payload sau transform, không object nguồn.
- Browser upload cần xác nhận file tồn tại, MIME/size hợp lệ.
- I2V hero path không được ngầm đổi Text-to-Video thành I2V khi chọn product.
- Chip `applied` trước Submit dễ nói quá. Trước Submit dùng `selected`; job tạo xong mới `applied`.
- Ảnh thumbnail không chứng minh ảnh gốc nào đã gửi. Snapshot cần content hash.
- Removing chip trong lúc queued không sửa queued job. Cần microcopy ngay hành động remove.

## C. Best practice

- `selectedProductContext`: draft mutable.
- `sentProductContext`: immutable, route-normalized.
- Allowlist field: `title`, sanitized `url`, selected `notes`, image reference/hash.
- Preview đúng payload route.
- Capability contract khai báo `acceptsTextContext`, `acceptsImageReference`, `requiresImage`.
- Không adapter tự suy diễn mode.
- Job result lưu provenance tối thiểu: product ID, version/snapshot, image hash, fields sent.
- Không lưu lại secrets đã redacted.

## D. Chỉnh plan — bốn quyết định cứng

### 1. Primary profile

**Chọn: app-owned primary directory.**

- Không reuse `Chrome Profile 6`.
- Một isolated profile cho workspace Phase 1.
- Lý do: khóa profile, cookie exposure, corruption, extension drift.
- Profile cá nhân import/reuse: cắt khỏi scope.

### 2. Phase 1 providers

**Chọn: Grok Video API בלבד + Grok Browser experimental cho web-only parity path.**

- ChatGPT, Gemini, Flow, Veo: ẩn production.
- Lý do: ship một vertical slice hoàn chỉnh; logo count không tạo giá trị.
- Browser chỉ xuất hiện khi capability route đã pass end-to-end contract.
- Nếu chưa pass: ship Grok Video API בלבד; không wizard Browser giả.

### 3. Probe TTL

**Chọn: passive TTL 15 phút; active pre-dispatch threshold 2 phút.**

- Đây là một policy cố định, không setting.
- Composer dùng cache ≤15 phút để hiển thị.
- Browser dispatch active probe nếu lần active gần nhất >2 phút.
- Dispatch luôn revalidate lease.
- Không navigation polling nền.

### 4. Wizard hard-gate

**Chọn: Có — hard-gate Browser Submit בלבד.**

- Không gate API.
- Gate chỉ route/provider được chọn.
- Wizard hoàn tất khi `Grok Browser` probe Ready.
- Không yêu cầu probe mọi platform.
- User có thể thoát, đổi sang API.
- Không có Browser route production thì không hiện wizard.

### Checklist đóng

- [x] Phase 1 primary only
- [x] Preflight block selected route Submit
- [x] No silent browser fallback
- [x] Capability → Provider → Connection
- [x] Browser opt-in policy
- [x] Immutable job snapshot
- [x] App-owned primary directory
- [x] Phase 1: Grok Video API + qualified Grok Browser experimental
- [x] Probe policy: passive 15m, active 2m
- [x] Wizard hard-gates Browser only

### BugSell UI copy

- Draft: `BugSell · Product A selected`
- Expand: `What will be sent`
- After job creation: `Product context applied`
- Remove: `Removed from future jobs. Queued jobs unchanged.`
- Image mode change: `Use product image for I2V` — explicit toggle/action, không ngầm đổi.

## E. Câu hỏi ép Grok

1. “Existing I2V hero path” hiện nhận image asset ID, URL hay local file?
2. Product notes field nào được allowlist? Ai chịu trách nhiệm redaction?
3. URL sanitizer bỏ query toàn bộ hay giữ commerce params nào?
4. Browser preview thể hiện exact transformed text hay chỉ fields nguồn?
5. Product update sau queue có giữ snapshot bytes/image hash không?
6. Missing/deleted image sau queue xử lý từ snapshot copy hay fail?
7. Chọn BugSell product có tự bật I2V không? Câu trả lời bắt buộc: **không**.
8. Grok Browser parity path đã pass submit/status/artifact/cancel chưa?
9. Nếu chưa pass, có đồng ý ship Phase 1 API-only, xóa wizard khỏi production không?
10. Ai sở hữu capability contract để ngăn adapter tự biến text route thành image route?

---

## Vòng 6 — GROK

# Vòng 6 — GROK (Bridge architecture)

## Chấp nhận hard picks R5
App-owned primary; Phase1 = Grok Video API + Grok Browser experimental; probe 15m/2m; wizard hard-gate Browser only; ChatGPT/Gemini/Flow ẩn production.

## Bridge proposal
- social-ops extension = control plane on seat (heartbeat, lease job, report)
- grok-automation-ext = execution surface (web UI automation) — optional orchestration via DOM/recipe OR message-passing later
- Phase1 MVP bridge: **job steps doable by bridge shell alone** (navigate, wait, click, type, screenshot, download detect) — không phụ thuộc reverse-engineer full FlowVeo ext protocol

## Conflict
User muốn "tích hợp ext". Grok sợ coupling minified ext.  
Vị trí: **vendored ext là capability packs cài trên seat**; app contract là bridge + capability registry. Ext UI automation = best-effort adapter, version-pinned.

## Job lease (web BFF must ship)
`queue → next(lease 60s heartbeat) → running → complete|fail`  
Missing next/complete trên Next = blocker Phase1 Browser.

## Thách
1) Phase1 Browser có **bắt buộc** grok-automation-ext, hay bridge shell + recipe đủ?
2) Có cho phép CDP recipe song song extension mode không (hybrid)?
3) Artifact download path: ext download folder watch vs CDP Network.getResponseBody?

---

## Vòng 6 — CX_AGY

## A. Đồng ý có điều kiện

- Bridge contract độc lập vendored ext: đúng.
- **Phase 1 Browser không bắt buộc `grok-automation-ext`.** Bridge shell + một Grok recipe đủ.
- Hybrid không cho chạy song song trên cùng job. Cho phép hai adapter trong registry; job snapshot chọn đúng một.
- Artifact mặc định: browser download + app-owned per-job folder watch.
- `next/complete/fail` là blocker. `heartbeat` cũng blocker; lease 60s chưa đủ nếu semantics mơ hồ.
- “Control plane on seat” chấp nhận nếu extension thật sự cần. Native app/BFF đã điều khiển CDP thì thêm `social-ops extension` có nguy cơ trùng vai trò.

## B. Phản biện

### Bridge shell

- Shell tổng quát `click/type/wait` dễ thành automation framework tự chế.
- Recipe từ BFF là remote code dạng declarative. Selector/action độc hại có thể thao tác account.
- Screenshot không phải success signal.
- DOM recipe dễ vỡ do localization, A/B test, shadow DOM, virtualized UI.
- Browser experimental vẫn cần typed terminal result; “best effort” không được đồng nghĩa fail mơ hồ.

### Vendored extension

- “Capability pack” quá mạnh nếu extension không có contract ổn định.
- Minified ext coupling tạo supply-chain, permission, drift, legal/licensing risk.
- Version pin chỉ phát hiện thay đổi; không tạo compatibility.
- Không reverse-engineer protocol: đúng. Vậy Phase 1 không được tuyên bố integration sâu.
- Cài extension nhưng không dùng trong execution chỉ là packaging, không phải tích hợp.

### Hybrid

- CDP và extension cùng click/type gây race, duplicate submit, focus theft.
- Extension content script, CDP navigation cùng điều khiển lifecycle gây stale references.
- Fallback giữa mode sau `running_provider` vi phạm no partial route switch.
- Hai mode nhân đôi contract test. Phase 1 không cần.

### Lease

- `queue → next → running` có race nếu `next` lease rồi worker chết trước `running`.
- Heartbeat 60s bằng lease 60s tạo expiry do jitter. Cần heartbeat ngắn hơn lease.
- `complete` có thể đến sau lease expiry; stale worker không được thắng.
- Retry cần `attemptId` + fencing token.
- `complete` phải idempotent. Artifact commit phải atomic hoặc recoverable.
- `awaiting_human` không thể giữ lease 60s vô hạn.

### Artifact

- `Network.getResponseBody` không phù hợp mặc định:
  - response lớn;
  - blob URL;
  - streaming;
  - signed redirect;
  - service worker;
  - memory pressure.
- Folder watch đơn thuần dễ bắt `.crdownload`, file cũ, duplicate filename, unrelated download.
- Extension download API tăng permission; chưa cần nếu CDP/browser download behavior đủ.

## C. Best practice

- Một route, một adapter, một owner per job.
- Phase 1 adapter: `grok_browser_recipe_v1`.
- Recipe vendored trong app release; không tải action tùy ý từ BFF.
- Action allowlist nhỏ: navigate approved origin, locate, input, click, wait typed condition, initiate download.
- Selector/version pin; fixture smoke check.
- Provider-start boundary explicit. Sau boundary: không đổi adapter.
- Lease:
  - lease 60s;
  - heartbeat 20s;
  - `attemptId`;
  - monotonic fencing token;
  - compare-and-set transitions;
  - idempotent terminal report.
- Download:
  - per-job directory;
  - set download behavior trước run;
  - correlate download event với `jobId/attemptId`;
  - chờ completed event + stable size;
  - validate MIME, magic bytes, size;
  - atomic move vào artifact store;
  - content hash + unique DB key.

## D. Chỉnh plan

### Quyết định cứng

1. **Không bắt buộc `grok-automation-ext` Phase 1.**
2. **Không hybrid song song.**
3. **Chọn folder download event/watch; không `Network.getResponseBody` mặc định.**

### Kiến trúc tối thiểu

```text
BFF queue
  → bridge worker
  → CDP
  → vendored grok_browser_recipe_v1
  → per-job download directory
  → artifact store
```

- `social-ops extension`: cắt nếu CDP worker làm được heartbeat, execution, reporting.
- Chỉ giữ extension khi có capability browser-native bắt buộc mà CDP không cung cấp.
- `grok-automation-ext`: cài experimental riêng; không nằm critical path.
- Capability registry khai báo:

```text
Grok Video
provider: Grok
connection: Browser
adapter: grok_browser_recipe_v1
experimental: true
requiresExtensions: []
```

- Không abstraction factory. Một adapter hardcoded đủ Phase 1.
- Capability pack registry chỉ thêm khi adapter thứ hai thực sự ship.

### Lease protocol tối thiểu

```text
POST /jobs/next
→ { jobId, attemptId, leaseToken, leaseExpiresAt, inputSnapshot }

POST /jobs/{jobId}/heartbeat
{ attemptId, leaseToken }

POST /jobs/{jobId}/running
{ attemptId, leaseToken }

POST /jobs/{jobId}/complete
{ attemptId, leaseToken, artifacts }

POST /jobs/{jobId}/fail
{ attemptId, leaseToken, code, remediation, partialArtifacts }
```

Server requirements:

1. `/next` atomically leases một queued job.
2. Heartbeat mỗi 20s; lease gia hạn 60s.
3. Mọi mutation kiểm tra `attemptId + leaseToken`.
4. Lease expiry requeue chỉ nếu chưa `running_provider`; sau provider start, chuyển `failed_partial/reconcile`, không blind retry.
5. `complete/fail` idempotent.
6. Artifact unique key `(jobId, attemptId, artifactIndex)`.
7. Cancel dùng compare-and-set; stale worker bị fence.

### Download flow

1. Tạo directory riêng theo `jobId/attemptId`.
2. Cấu hình browser download vào directory đó.
3. Xóa directory mới tạo nếu collision; không dùng shared Downloads.
4. Bắt download event; folder watch chỉ hỗ trợ completion.
5. Chờ hết `.crdownload`, size ổn định.
6. Validate file.
7. Hash.
8. Atomic move.
9. Commit artifact metadata idempotently.
10. Cleanup sau terminal status.

**Cảnh báo:** Đường dẫn download phải do app tạo dưới app-owned storage. Không chấp nhận path từ job payload. Resolve canonical path, chống `../`, symlink escape. Không overwrite file ngoài artifact directory.

### Gate Browser Phase 1

- `/next`, heartbeat, running, complete, fail hoàn chỉnh.
- One-job lease test pass.
- Worker crash test pass trước/sau `running_provider`.
- Duplicate complete test pass.
- Download partial/collision test pass.
- Recipe submit/status/artifact/cancel pass.
- Wizard probe pass.
- Nếu thiếu: production API-only; Browser giữ dev flag.

## E. Câu hỏi ép

1. `social-ops extension` cung cấp capability nào CDP/native worker không làm được?
2. Bridge worker nằm app desktop, extension service worker hay server?
3. Recipe được bundle cùng release hay tải động từ BFF?
4. Ai ký/kiểm hash vendored extension và recipe?
5. Signal chính xác cho `running_provider` là click Submit hay provider xác nhận request?
6. `/next` dùng DB transaction/locking nào để tránh double lease?
7. Lease expiry sau provider submit được reconcile bằng provider job ID nào?
8. Browser download có phát event qua CDP hiện tại không? Chromium version đã pin?
9. Video có blob/stream hay nút download file thật? Đã kiểm chứng?
10. Nếu `grok-automation-ext` không nằm critical path, “tích hợp ext” có requirement đo được nào ngoài việc cài?

---

## Vòng 7 — GROK

# Vòng 7 — GROK (Security & trust boundary)

## Threats
- App-owned profile cookies = crown jewels (Grok session)
- Bridge token theft → job injection
- BugSell notes prompt injection into model
- Malicious product image
- Extension update supply chain (update.ps1 from Chrome store copy)

## Controls đề xuất
- Bridge token: workspace-local, rotated, bound to seatId, not in page JS
- Job allowlist hosts
- Product notes length + strip secrets patterns
- Image: size/MIME + optional AV scan later
- Profile dir ACL user-only; confirm destructive reset
- No remote code in patches without hash pin

## UX security
- Clear "This browser seat is managed by SocialOps" badge in Workspace
- Never ask user to paste cookies into draft-box

## Thách
1) Bridge token storage: OS keychain vs file SocialsHub — tradeoff?
2) Có cần "lock seat" khi user browsing manually?
3) Telemetry: bao nhiêu log được phép (URLs may contain tokens)?

---

## Vòng 7 — CX_AGY

## A. Đồng ý có điều kiện

- Threat model đúng lõi.
- Bridge token: **OS keychain**, file chỉ giữ opaque credential ID.
- Seat: **exclusive lock khi leased/running**. Không khóa khi idle.
- Telemetry: **metadata allowlist**, không raw URL/prompt/cookie/DOM/screenshot mặc định.
- Host allowlist cần origin + scheme + redirect enforcement; hostname đơn thuần thiếu.
- Image validation bắt buộc. AV scan hoãn được nếu file không execute, không serve inline nguy hiểm.
- Hash pin bắt buộc nhưng chưa đủ cho extension supply chain.

## B. Phản biện

- “Workspace-local token” mơ hồ. Workspace DB bị copy vẫn không được mang secret dùng được.
- Token dài hạn bound `seatId` vẫn replay được sau theft.
- Không đưa token vào page JS đúng; extension content script cũng là vùng kém tin cậy.
- Regex strip secrets không bảo đảm phát hiện secrets. Notes vẫn là untrusted data.
- Prompt injection không thể “sanitize” hoàn toàn mà giữ semantics.
- MIME header giả được. Extension, magic bytes, decoder đều cần kiểm.
- Ảnh có decompression bomb, malformed codec, metadata PII.
- `update.ps1` tải bản Chrome Store copy là remote code execution path. Hash pin từ cùng nguồn không tạo trust.
- User browsing thủ công khi automation chạy gây focus theft, submit nhầm, data leak.
- Badge Workspace không đủ. Browser window cần managed identity nhìn thấy.
- Screenshot có thể chứa account, conversation, email, token trong URL/UI.
- Activity log retention chưa chốt tạo kho dữ liệu nhạy cảm.

## C. Best practice

### Bridge authentication

- Root credential trong OS keychain:
  - Windows Credential Manager/DPAPI.
  - macOS Keychain.
  - Linux Secret Service; nếu unavailable, disable Browser setup hoặc yêu cầu explicit insecure dev mode.
- BFF cấp lease-scoped token ngắn hạn:
  - bound `workspaceId`, `seatId`, `jobId`, `attemptId`;
  - audience-bound;
  - expiry ≤ lease;
  - nonce;
  - least-privilege actions.
- Token chỉ trong native bridge memory.
- Browser/extension nhận commands qua authenticated local channel; không nhận root token.
- Local listener bind loopback; random port; origin check; challenge-response.
- Rotate root credential khi reset seat, suspected theft, workspace transfer.

### Seat locking

- DB lease là authority.
- Browser hiển thị `Managed run active`.
- Automation dùng dedicated controlled tab/window.
- Manual interaction trong controlled target khi active:
  - detect;
  - pause before provider submit;
  - require Resume/Re-check.
- Không cố khóa OS input.
- `Open browser` lúc leased mở read-only status hoặc cảnh báo rõ.
- Reset/update/close profile disabled khi active.

### BugSell notes

- Treat as quoted untrusted product data, không instruction.
- Delimit trong prompt/template.
- Field allowlist; length cap; Unicode normalize.
- Secret detector: warning + redact preview; không tuyên bố hoàn hảo.
- User xem exact transformed payload.
- Adapter system instruction giữ precedence.
- Không cho notes quyết định host, selector, file path, tool action.

### Images

- Decode/re-encode bằng trusted image library/native codec thành PNG/JPEG.
- Pixel-count, dimensions, bytes limits.
- Strip metadata.
- Reject SVG, HTML, polyglot, animated image Phase 1.
- Store outside web root; random generated filename.
- Serve bằng fixed content type, `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`.
- AV scan thêm khi enterprise policy hoặc file được chia sẻ/xuất ra ngoài trust boundary.

### Supply chain

- Không runtime `update.ps1` từ mạng trong production.
- Bundle known extension version cùng signed app release.
- Verify SHA-256 từ release manifest đã ký.
- Check extension ID, version, permissions.
- Update qua signed SocialOps release.
- Chrome Store auto-update: tắt cho vendored unpacked extension hoặc coi drift là hard fail.
- Extension permission tăng: yêu cầu review, không auto-accept.

## D. Chỉnh plan

### Quyết định cứng

1. **Bridge root token lưu OS keychain.**
2. **Seat exclusive-lock khi `leased|running_provider|awaiting_human`.**
3. **Production telemetry chỉ allowlisted structured metadata.**
4. **Không tải/chạy `update.ps1` từ xa.**
5. **Product image decode/re-encode bắt buộc Phase 1.**

### Token flow

1. Setup tạo random 256-bit root credential.
2. Lưu root credential trong OS keychain.
3. Workspace DB lưu credential reference, `seatId`, public metadata.
4. `/next` trả lease-scoped capability token; không trả root credential.
5. Bridge giữ token trong memory.
6. Mọi mutation dùng `attemptId + leaseToken`; server fence stale worker.
7. Terminal/expiry xóa token memory.
8. Reset seat rotate credential, revoke sessions.

**Cảnh báo:** Không fallback im lặng từ OS keychain sang plaintext file. Nếu keychain unavailable, Browser route phải báo `Secure credential storage unavailable` và bị khóa. Chỉ dev build mới được phép file storage, kèm cảnh báo rõ.

### Lock behavior

- Idle: manual browsing cho phép.
- Active lease: controlled tab dành riêng automation.
- User input phát hiện trước submit: pause `manual_interference`.
- User vẫn có thể mở browser để xử lý challenge.
- `awaiting_human`: automation dừng; sau thao tác phải active probe lại.
- Không chạy manual và automation song song trên cùng controlled tab.
- Không silent resume.
- Lease timeout vẫn áp dụng; challenge dùng explicit extended state, audit được.

### Telemetry allowlist

Được log:

```text
timestamp
workspaceHash
seatHash
jobId
attemptId
capability
provider
connection
adapterVersion
extensionVersion
stateFrom
stateTo
typedErrorCode
durationMs
retryCount
probeAgeMs
artifactCount
artifactBytes
```

Không log mặc định:

```text
cookies
tokens
Authorization headers
raw URL
query string
fragment
prompt
BugSell notes
product title
DOM
HTML
screenshots
local file paths
account email
browser profile path
```

- Origin log nếu cần: normalized enum, ví dụ `grok.com`; không full URL.
- Error message từ provider: map typed code; raw text local-only, ephemeral.
- Diagnostic bundle: explicit consent, preview, redact, expiry 24h.
- Production retention: **30 ngày metadata**, **24 giờ diagnostics**, rồi hard delete.
- Security audit events giữ **90 ngày**, không payload.

### Extension packaging

```text
signed app release
  → signed manifest
  → pinned extension archive hash
  → local install
  → runtime version/permission check
```

- Hash mismatch: hard fail `extension_integrity_failed`.
- Version drift: hard-gate Browser; API vẫn hoạt động.
- Không silent downgrade/fallback.

## E. Câu hỏi ép

1. BFF và bridge cùng máy hay qua internet? Threat model token khác hẳn.
2. Linux không có Secret Service có chấp nhận Browser bị khóa không?
3. Root credential có thực sự cần nếu lease token đã do authenticated desktop session lấy?
4. Local bridge channel dùng native messaging, loopback HTTP hay WebSocket?
5. Extension content script cần command nào mà CDP worker không làm được?
6. Ai ký release manifest? Private signing key nằm ở đâu?
7. Chrome Store license có cho phép bundle/copy extension không?
8. Image maximum bytes, dimensions, megapixels chốt số nào?
9. Challenge kéo dài tối đa bao lâu trước khi lease nhả?
10. Diagnostic screenshot có requirement thực không? Nếu không, cắt toàn bộ screenshot telemetry.

---

## Vòng 8 — GROK

# Vòng 8 — GROK (Observability + supportability)

## Events tối thiểu
seat.probe, seat.login_state, job.created, job.route_selected, job.preflight, job.started, job.progress, job.completed, job.failed, bridge.heartbeat, ext.drift

## User-visible
- Mini timeline draft-box
- Workspace activity feed
- Copy support bundle (redacted)

## Metrics Phase2 gate (nhắc lại, siết)
- bridge success ≥ 95% over 100 jobs
- p95 queue wait
- concurrent demand
- human-challenge rate < X%

## Thách
1) Progress % từ browser job có được "ảo" không? Prefer stage labels over fake %.
2) Có store raw DOM snapshots khi fail? Privacy?
3) SLA nội bộ Phase1 Browser experimental: best-effort badge bắt buộc?

---

## Vòng 8 — CX_AGY

## A. Đồng ý có điều kiện

- Stage labels: **bắt buộc**. Không progress % giả.
- Raw DOM snapshot: **không lưu** production.
- `Experimental`: **badge bắt buộc** mọi surface chọn route, preflight, timeline failure.
- Support bundle: **download/copy có preview + consent**; không tự upload.
- Event list đúng hướng; cần giảm heartbeat volume, chuẩn hóa schema.
- Metrics Phase 2 chưa đóng vì thiếu denominator, time window, typed outcome.

## B. Phản biện

- `job.progress` mơ hồ, dễ biến thành log spam. Dùng stage transition.
- `job.started` cần tách `worker_started` và `provider_started`; retry semantics khác.
- `job.failed` thiếu `failed_partial`, `cancelled`, `superseded`, `awaiting_human`.
- `seat.login_state` có thể lộ account behavior; chỉ log typed state, không identity.
- `bridge.heartbeat` mỗi 20s không nên vào activity feed hoặc telemetry event store dài hạn.
- `job.route_selected` trước submit là draft analytics; sau submit mới là audit fact.
- 95% trên 100 jobs quá ít; một workspace/provider burst dễ méo.
- “Bridge success” có thể che provider fail, challenge, artifact fail.
- `human-challenge rate < X%` không hoàn toàn controllable; provider/account/region ảnh hưởng.
- p95 queue wait không có target, concurrency, sample window nên chưa thành gate.
- “Best effort” dễ bị hiểu là không có trách nhiệm. Experimental vẫn phải bảo toàn dữ liệu, không duplicate submit, không rò secrets.

## C. Best practice

### Event envelope

```text
eventId
eventName
schemaVersion
occurredAt
receivedAt
workspaceHash
seatHash
jobId?
attemptId?
capability
provider
connection
adapterVersion
stateFrom?
stateTo?
outcome?
errorCode?
durationMs?
```

- Server tạo canonical transition events.
- Client events chỉ telemetry; không làm audit authority.
- `eventId` idempotency.
- Enum allowlist; không arbitrary properties.
- Clock skew dùng `receivedAt` cho ordering fallback.
- Heartbeat lưu current-state/last-seen; không append vô hạn.

### Stage labels

```text
Queued
Checking browser
Opening Grok
Preparing input
Submitting to Grok
Waiting for Grok
Downloading result
Saving result
Needs your attention
Completed
Failed
```

- Không phần trăm.
- Chỉ chuyển tiến; retry hiển thị `Retrying · attempt 2`.
- `Submitting` chưa đồng nghĩa provider accepted.
- Sau provider acknowledgment: `Waiting for Grok`.
- Stalled threshold tạo typed state, không đoán %.

### Support bundle

- Chỉ structured metadata allowlist.
- Local generation.
- Preview file list + redaction summary.
- Random bundle ID.
- Expiry hướng dẫn; không app-side upload mặc định.
- Không DOM, screenshot, cookie, token, prompt, notes, raw URL, local path.
- Recipe selector failure chỉ lưu selector **ID**, không selector/runtime HTML.

## D. Chỉnh plan

### Events Phase 1

Giữ:

```text
seat.probe_completed
seat.auth_state_changed
job.created
job.preflight_completed
job.worker_started
job.provider_started
job.stage_changed
job.awaiting_human
job.completed
job.failed
job.failed_partial
job.cancelled
job.superseded
ext.drift_detected
```

Đổi:

- `job.route_selected`: nằm trong immutable `job.created`, không event riêng.
- `job.progress`: đổi `job.stage_changed`.
- `bridge.heartbeat`: upsert `bridge_last_seen`; chỉ emit `bridge.offline`/`bridge.recovered`.
- `seat.login_state`: đổi `seat.auth_state_changed`.
- `ext.drift`: đổi `ext.drift_detected`.

### User surfaces

**Draft-box mini timeline**

- Job hiện tại.
- Stage hiện tại.
- Timestamp.
- Attempt.
- Typed remediation.
- Experimental badge.
- Link `View activity`.

**Workspace activity feed**

- State transitions quan trọng בלבד.
- Filter seat/job/outcome.
- Không heartbeat.
- Retention 30 ngày.
- Security events riêng, 90 ngày.

**Support bundle**

```text
manifest.json
events.json
runtime.json
checks.json
redaction-report.txt
```

- `Copy summary`: text ngắn.
- `Download support bundle`: archive.
- Không thêm screenshot/DOM toggle Phase 1.

### Phase 2 gate

**Chọn window:** rolling 30 ngày, tối thiểu 100 terminal Browser jobs, ít nhất 10 active days. Internal/test jobs loại.

**Bridge execution success**

```text
jobs completed with valid artifact
/
eligible terminal Browser jobs
≥ 95%
```

Loại khỏi denominator:

- user-cancelled trước provider start;
- provider-declared outage;
- explicit human challenge.

Không loại:

- bridge crash;
- recipe drift;
- lease loss;
- duplicate submit prevention stop;
- download/artifact failure;
- unknown failure.

Báo thêm challenge-inclusive success; không dùng exclusions để che chất lượng.

**Queue wait**

```text
p95(createdAt → workerStartedAt) ≤ 60s
```

- Chỉ khi seat `ready + idle`.
- Báo riêng `no_capacity`.
- Minimum 100 samples.

**Concurrent demand**

```text
p95 simultaneous eligible queued jobs ≥ 2
```

trong ít nhất 10 active days mới biện minh multi-seat. Nếu thấp hơn: giữ primary-only.

**Human challenge**

```text
provider sessions entering awaiting_human
/
provider-started jobs
```

- **Target < 10%.**
- Báo theo provider, account cohort, adapter version.
- Không hard-block Phase 2 một mình; >10% bắt buộc root-cause review.
- Login hết hạn tách khỏi anti-bot challenge.

### Experimental SLA

- Badge bắt buộc: `Experimental`.
- Copy: `Browser automation may require attention. API remains the recommended route.`
- Không gọi “best effort” trong UI.
- Internal SLO:
  - không duplicate provider submit;
  - không cross-job artifact;
  - không secret telemetry;
  - ≥95% eligible completion;
  - typed remediation ≥99% failures;
  - unknown failure <1%.
- Safety SLO vi phạm: disable Browser route bằng explicit kill switch; không fallback API.

## E. Câu hỏi ép

1. `job.provider_started` lấy provider acknowledgment nào, hay chỉ suy từ click?
2. Stage nào có timeout cụ thể? Timeout có theo adapter version không?
3. Provider outage source đáng tin nào cho denominator exclusion?
4. Challenge detection phân biệt login expiry, CAPTCHA, account limit thế nào?
5. Ai được xem Workspace activity feed? Role/access audit?
6. Support bundle có cần account email không? Khuyến nghị: **không**.
7. Kill switch scope global, workspace, adapter version hay provider?
8. Event schema migration xử lý dashboard cũ thế nào?
9. 100 jobs đạt trong bao lâu? Nếu sáu tháng mới đủ, Phase 2 còn ý nghĩa không?
10. Có requirement debug nào thật sự cần DOM? Nếu không, đóng vĩnh viễn Phase 1.

---

## Vòng 9 — GROK

# Vòng 9 — GROK (Concurrency & queue UX)

## Phase1 rules
- Max 1 browser job at a time on primary
- API jobs parallel per existing Grok OAuth pool policy (separate)
- Queue FIFO per connection type
- User can cancel queued; running cancel = best-effort

## UI
- "1 browser job running" global indicator
- Disable second browser submit with explanation
- API submit still allowed

## Pushback
- Batch draft-box multi-video: browser path must serialize; API path can batch
- Never interleave two browser automations on same profile

## Thách
1) Batch 5 videos mixed API+Browser: UI split hay reject mixed batch?
2) Priority: user-facing interactive job > background batch?

---

## Vòng 9 — CX_AGY

## A. Đồng ý có điều kiện

- Primary Browser concurrency `1`: chốt.
- API pool độc lập: chốt.
- Không interleave cùng profile: invariant.
- Queued cancel: bắt buộc, atomic.
- Running cancel: best-effort nhưng phải typed outcome.
- **Phản đối disable Browser submit thứ hai.** Queue tồn tại thì phải cho enqueue. Disable chỉ khi product cố ý không hỗ trợ queue UX.
- FIFO theo **connection**, không “connection type”; Browser primary là một queue.

## B. Phản biện

- Disable submit mâu thuẫn `queue → next`. User không thể xếp việc.
- “1 browser job running” thiếu queued count, current owner, ETA uncertainty.
- FIFO tuyệt đối mâu thuẫn interactive priority.
- Priority dễ starvation background, phá thứ tự batch.
- Mixed batch split ngầm tạo hai timing, cancel model, billing/error semantics.
- Một batch chung nhưng nhiều routes làm provenance khó đọc.
- API “batch” không đồng nghĩa provider hỗ trợ atomic batch. Thực chất fan-out jobs.
- Running cancel sau provider submit có thể không hủy generation; chỉ dừng monitoring sẽ tạo orphan artifact.
- Cancel worker bằng kill process có thể bỏ lease/tab/download dở.
- Browser batch 5 có thể giữ seat lâu; auth/challenge giữa item cần pause rõ.
- Immutable snapshot phải tồn tại từng child job, không chỉ parent batch.

## C. Best practice

- Batch là UI grouping; execution là child jobs độc lập.
- Route chọn ở batch level Phase 1.
- Một batch, một connection.
- Browser batch enqueue 5 child jobs, serialize FIFO.
- API batch fan-out theo OAuth pool policy.
- Queue position hiển thị; ETA chỉ khi đủ dữ liệu, không đoán.
- Cancel scopes:
  - queued child;
  - remaining batch;
  - running attempt.
- Running cancel state:
  - `cancel_requested`;
  - `cancelled_before_provider_start`;
  - `cancelled_provider_confirmed`;
  - `cancelled_monitoring_only`;
  - `cancel_failed`.
- Sau provider start: tiếp tục reconcile artifact nếu provider không hỗ trợ cancel.
- DB constraint/lease bảo đảm tối đa một active Browser attempt.

## D. Chỉnh plan

### Quyết định cứng

1. **Mixed API + Browser batch: reject.**
2. **Route chọn một lần cho toàn batch.**
3. **Priority Phase 1: FIFO tuyệt đối; không interactive priority.**
4. **Cho enqueue Browser job thứ hai; không disable Submit.**
5. **Browser batch serialize từng child; API batch fan-out.**

Lý do:

- Mixed split tăng state/cancel/support gấp đôi.
- Priority scheduler chưa có nhu cầu chứng minh.
- FIFO dễ giải thích, audit, test.
- Queue đã ship thì dùng queue; không viết dead-end UX.

### UI

Khi Browser idle:

```text
Browser ready
```

Khi Browser running:

```text
Browser busy · 1 running · 3 queued
New Browser jobs will be queued.
```

Sau submit:

```text
Queued for Grok Browser · Position 4
```

Batch route picker:

```text
Generate 5 videos with:
(•) Grok Video API — parallel
( ) Grok Browser · Experimental — one at a time
```

Nếu draft items yêu cầu routes khác nhau:

```text
Mixed API and Browser batches aren’t supported.
Create separate batches.
```

Không auto-split. Không silent route change.

### Queue rules

```text
Browser primary:
concurrency = 1
ordering = createdAt, jobId
scope = connectionId
```

- Tie-break bằng `jobId`.
- Retry tạo `attempt`, giữ vị trí job nếu lỗi transient trước provider start.
- Retry sau provider start: không tự động; `failed_partial/reconcile`.
- Challenge giữ active slot trong thời hạn explicit.
- Sau challenge timeout: nhả execution lock, chuyển `awaiting_human`; resume phải requeue explicit, không chen đầu.
- API queue hoàn toàn riêng.

### Invariant tối thiểu

```text
At most one Browser attempt per connectionId
in leased | running | running_provider | cancelling
```

Dùng DB constraint/transaction advisory lock. Không chỉ kiểm tra app-side.

### Cancel sequence

1. User yêu cầu cancel.
2. Server compare-and-set sang `cancel_requested`.
3. Queued job chuyển `cancelled` ngay.
4. Running worker dừng action mới.
5. Nếu chưa provider start: cleanup, release lease.
6. Nếu đã provider start: thử provider cancel khi supported.
7. Nếu không xác nhận được: `cancelled_monitoring_only`; reconciliation tiếp tục nền.
8. Artifact đến sau cancel gắn job, không tự publish; user được thông báo.
9. Release lock chỉ sau controlled tab ổn định hoặc worker bị fenced.

**Cảnh báo:** Không đóng browser/kill worker ngay sau cancel nếu provider submit có thể đã xảy ra. Việc đó có thể tạo generation mồ côi, duplicate khi retry. Fence attempt, reconcile trạng thái, rồi cleanup.

### Không làm Phase 1

- Mixed-route batch.
- Priority scheduler.
- Queue reorder.
- Per-item route override.
- ETA dự đoán.
- Parallel Browser tabs.
- Auto-promote interactive jobs.

## E. Câu hỏi ép

1. Tại sao UI muốn disable submit khi queue protocol đã bắt buộc?
2. Batch có parent status hay chỉ group child jobs?
3. Cancel batch mặc định hủy queued remainder hay cả running child?
4. Grok Browser có provider-native cancel sau acknowledgment không?
5. Challenge giữ slot tối đa bao lâu: đề xuất số cứng?
6. Background batch được tạo từ đâu trong Phase 1? Nếu chưa có nguồn thật, bỏ priority requirement.
7. FIFO tính theo `createdAt` server hay client?
8. Retry pre-submit giữ vị trí có gây block queue vô hạn không? Giới hạn attempt bao nhiêu?
9. Artifact đến sau `cancelled_monitoring_only` hiển thị hay quarantine?
10. API OAuth pool có rate-limit chung khiến “parallel” cần cap cụ thể không?

---

## Vòng 10 — GROK

# Vòng 10 — GROK (Pool Phase 2 design — chỉ thiết kế, không ship)

## Khi đủ gate
- N seats app-owned clones from template (ext packs preinstalled)
- Scheduler: least_busy + Ready only + same capability
- No cross-seat mid-job migrate
- Sticky optional for multi-step campaigns

## UX
- "Use additional seats" workspace toggle default off
- Composer shows "May use seat 2" only if enabled
- Never show seat list in draft-box default

## Thách
1) Clone profile: copy user-data (login shared) vs fresh login per seat?
2) Shared login clone có vi phạm platform ToS / risk ban wave?

---

## Vòng 10 — CX_AGY

## A. Đồng ý có điều kiện

- Phase 2 chỉ thiết kế: đúng.
- Additional seats opt-in, default off: đúng.
- Ready + capability match: bắt buộc.
- Không mid-job migration: invariant.
- Draft-box ẩn seat list: đúng.
- **Không clone `user-data`.** Tạo profile sạch; login riêng từng seat.
- Template chỉ chứa cấu hình không nhạy cảm, extension pack đã pin.
- Sticky chỉ thêm khi multi-step campaign thật sự cần session continuity.

## B. Phản biện

- “App-owned clones” dễ bị hiểu clone cookies, Local Storage, device state. Đổi thuật ngữ: **provisioned seats**.
- Chromium profile copy khi đang dùng có nguy cơ corruption.
- Cookie mã hóa gắn OS/user context; copy không bảo đảm hoạt động.
- Cùng session cookie trên nhiều browser tạo concurrent-session anomaly, forced logout, challenge, account lock.
- Fingerprint giống nhau + hoạt động song song làm tăng correlated-abuse signal.
- Fresh profile nhưng cùng account vẫn không loại ToS/concurrency risk.
- Extension preinstalled chỉ an toàn nếu signed manifest/hash/permission check per seat.
- `least_busy` với concurrency `1` gần như chỉ là idle-seat selection; thêm load score chưa cần.
- `Ready` cache 15 phút không đủ dispatch. Mỗi seat vẫn cần active preflight nếu active probe >2 phút.
- “May use seat 2” lộ implementation nhưng không giúp user trước dispatch. Seat chưa được chọn.
- Toggle workspace thiếu quota, RBAC, cost, account ownership, audit.
- Sticky optional dễ giảm utilization, gây starvation.
- Pool không chữa được provider account rate limit nếu mọi seat dùng cùng account.

## C. Best practice

### Provisioning

- Mỗi seat:
  - profile directory riêng;
  - credential reference riêng;
  - bridge identity riêng;
  - extension integrity state riêng;
  - probe/auth state riêng;
  - exclusive lease riêng.
- Template allowlist:
  - browser policy;
  - extension archive/version;
  - recipe version;
  - preferences không nhạy cảm.
- Không copy:
  - `Cookies`;
  - `Local Storage`;
  - `IndexedDB`;
  - `Login Data`;
  - tokens;
  - cache;
  - history;
  - service-worker state;
  - machine-bound keys.

### Scheduling tối thiểu

Filter trước:

```text
enabled
Ready
capability supported
provider matched
connection matched
not leased
extension/recipe version accepted
active probe age ≤ 2m
policy eligible
```

Chọn sau:

```text
oldestIdleAt, seatId
```

- Không cần `least_busy` khi mỗi seat concurrency `1`.
- Scheduler assignment atomic.
- Seat pin vào `attemptId` đến terminal/reconcile.
- Probe fail: job giữ queued; xét seat khác **trước provider start**. Không gọi fallback route.
- Sau provider start: không migrate.

### Sticky

- Phase 2 đầu: bỏ.
- Thêm khi campaign có bước kế tiếp phụ thuộc provider-side conversation/session.
- Sticky preference, không guarantee.
- Hard sticky chỉ khi contract yêu cầu.
- TTL + fallback prompt explicit khi seat unavailable.

## D. Chỉnh plan

### Quyết định cứng

1. **Fresh profile per seat.**
2. **Manual login/authorization per seat.**
3. **Không chia sẻ hoặc clone login session.**
4. **Không dùng thuật ngữ clone; dùng provision.**
5. **Scheduler Phase 2 đầu: eligible idle seat, chọn `oldestIdleAt`.**
6. **Sticky cắt khỏi bản Phase 2 đầu.**
7. **Pool enable chỉ sau policy/ToS review theo provider.**

### ToS / ban risk

**Có.** Shared-login cloning có rủi ro đáng kể:

- vi phạm điều khoản chống credential/session sharing hoặc automation;
- phát hiện session replay;
- simultaneous geolocation/IP/device anomalies;
- CAPTCHA, logout toàn bộ;
- account suspension;
- ban wave ảnh hưởng mọi seat cùng account.

Không thể khẳng định vi phạm nếu chưa đọc điều khoản Grok hiện hành, account tier, API/web automation policy. Vì vậy:

- Browser pool default off.
- Workspace admin xác nhận account authorization.
- Không quảng bá pool như cách vượt rate limit.
- Không tự tạo account.
- Không bypass CAPTCHA/anti-bot.
- Không rotate seats để né throttling.
- Provider rate-limit/challenge phải dừng scheduling.
- API là route mặc định.

### Pool model

```text
Seat
  seatId
  profileDirRef
  credentialRef
  capabilities
  adapterVersion
  extensionManifestHash
  authState
  probeState
  lastActiveProbeAt
  leaseState
  oldestIdleAt
```

Không thêm generic scheduler framework. Một query atomic đủ:

```sql
SELECT seat_id
FROM seats
WHERE workspace_id = $1
  AND enabled = true
  AND auth_state = 'ready'
  AND probe_state = 'ready'
  AND last_active_probe_at >= now() - interval '2 minutes'
  AND lease_state = 'idle'
  AND capability = $2
ORDER BY oldest_idle_at, seat_id
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

`capability` thực tế nên qua normalized mapping/association hiện hữu; không nhét scalar nếu seat hỗ trợ nhiều capability.

### UX sửa

Workspace:

```text
Use additional browser seats · Off
Experimental. Each seat requires its own browser sign-in. Provider limits still apply.
```

Composer khi bật:

```text
Additional browser seats enabled
A ready seat will be selected at dispatch.
```

Không hiển thị `May use seat 2`; scheduler chưa assign.

Activity sau assignment:

```text
Assigned browser seat 2
```

Support/admin detail mới hiện seat ID. End-user draft-box không hiện danh sách.

### Gate bổ sung trước Pool

- ToS/legal review lưu version/date.
- ≥95% eligible Browser success theo gate đã chốt.
- Concurrent demand đạt gate.
- Per-seat auth/probe isolation test.
- No cookie/storage clone test.
- Atomic assignment race test.
- Cross-seat artifact isolation test.
- Account-wide throttle detection.
- Global/workspace/provider kill switch.
- Seat removal drain flow.
- Cost/quota/RBAC audit.

## E. Câu hỏi ép

1. “Template” hiện chứa file nào? Có cookie/storage vô tình nằm trong đó không?
2. Mỗi seat dùng cùng Grok account hay account được cấp phép riêng?
3. Grok ToS hiện cho phép web automation và concurrent sessions không? Dẫn điều khoản/version.
4. Mục tiêu pool là throughput hợp lệ hay né provider concurrency limit?
5. Ai thực hiện login từng seat? Workspace admin hay operator?
6. Seat login có MFA/challenge; recovery flow nào?
7. Provider throttle account-wide nhận biết bằng typed error nào?
8. Pool toggle role nào được bật? Có audit event không?
9. Seat bị disable giữa queued và dispatch xử lý thế nào?
10. Nếu fresh login per seat quá tốn vận hành, có chấp nhận kết luận **không ship Browser pool**, ưu tiên API scaling không?

---

## Vòng 11 — GROK

# Vòng 11 — GROK (Ship checklist Phase 1)

## Must-have
1. Bridge next/complete on web BFF
2. App-owned primary launch+CDP
3. Grok API path unchanged quality bar
4. Composer Capability→Provider→Connection+preflight
5. BugSell structured chip
6. Browser experimental flag + hard-gate wizard for Grok browser only
7. Failure matrix UX
8. Immutable job snapshot
9. Redacted support bundle

## Nice-to-have cut
- ChatGPT/Gemini/Flow
- Pool
- Demo mode
- Parallel multi-provider probe
- Auto pool hop

## Definition of Done Browser experimental
- 10 consecutive storyboard-like jobs success on staging seat
- Login probe false-positive < 5%
- Zero silent API→Browser fallback in tests

## Thách
Chấm điểm plan hiện tại /10 cho: product clarity, eng risk, UX honesty. Không được 10. Chỉ ra top 3 residual risks.

---

## Vòng 11 — CX_AGY

## A. Đồng ý có điều kiện

- Scope Phase 1: đúng, đủ hẹp.
- Nice-to-have: cắt toàn bộ.
- API path: regression gate độc lập.
- Browser: experimental, primary-only, app-owned.
- Wizard: hard-gate **Grok Browser בלבד**.
- BugSell structured chip: optional; không blocker submit nếu trống.
- DoD hiện tại: chưa đủ ship. `next/complete` phải thành `next/heartbeat/running/complete/fail/cancel`.
- 10 consecutive jobs: smoke gate, không reliability proof.

## B. Phản biện

- “Storyboard-like” mơ hồ. Fixture, input class, artifact assertions chưa định nghĩa.
- `<5%` cần sample size. 10 jobs không đo được đáng tin.
- Zero silent fallback chỉ kiểm API-to-Browser chưa đủ. Cần cả Browser-to-API, adapter switch, seat switch.
- Failure matrix UX không bảo đảm typed backend failures đầy đủ.
- Support bundle dễ thành scope creep nếu chưa khóa allowlist.
- Immutable snapshot cần ranh giới: route, capability, provider, connection, recipe version, input hashes, BugSell payload.
- Preflight có race. Passive probe 15 phút chỉ UX hint; active probe 2 phút mới đủ dispatch.
- Browser success có thể che duplicate submit, artifact nhầm, stale worker.
- “Grok API unchanged” cần baseline test; tuyên bố không đủ.

## C. Best practice

### Điểm

| Trục | Điểm | Lý do |
|---|---:|---|
| Product clarity | **8.5/10** | Route model rõ; scope cắt tốt. Batch/cancel/experimental copy đã chốt. |
| Engineering risk | **6.5/10** | CDP recipe, auth drift, lease/cancel/artifact vẫn nhiều failure mode. |
| UX honesty | **8/10** | Experimental, stage labels, no silent fallback tốt. Cancel best-effort, challenge, late artifact còn khó diễn đạt. |

`Engineering risk` điểm cao nghĩa rủi ro được kiểm soát tốt; hiện chỉ trung bình-khá.

### Top 3 residual risks

1. **Grok UI/auth drift** phá selector, login probe, submit acknowledgment.  
   Kiểm soát: recipe pin, active preflight, canary, typed drift failure, kill switch.

2. **Exactly-once illusion** gây duplicate generation hoặc artifact sai sau lease loss/cancel.  
   Kiểm soát: `attemptId`, fencing token, provider-start boundary, idempotent completion, per-job download directory, reconciliation.

3. **Session/supply-chain exposure** làm lộ cookie hoặc chạy extension/code không tin cậy.  
   Kiểm soát: OS keychain, profile ACL, no page token, bundled hash-pinned assets, no remote `update.ps1`, redacted telemetry.

## D. Chỉnh plan

### Must-have sửa

1. BFF Bridge protocol:
   - `next`
   - `heartbeat`
   - `running`
   - `complete`
   - `fail`
   - `cancel_requested`
2. Primary profile launch + CDP ownership + exclusive lock.
3. Grok Video API regression suite giữ baseline.
4. Composer `Capability → Provider → Connection`.
5. Preflight:
   - passive cache 15 phút;
   - active probe nếu cache cũ hơn 2 phút;
   - no silent fallback.
6. BugSell structured optional chip; exact preview.
7. Browser experimental flag; wizard hard-gate Browser בלבד.
8. Typed failure matrix + remediation.
9. Immutable job/attempt snapshot.
10. Redacted support bundle allowlist.
11. Per-job download isolation + artifact validation.
12. Kill switch global/workspace/adapter version.

### Immutable snapshot tối thiểu

```text
jobId
attemptId
capability
provider
connectionId
adapterVersion
recipeVersion
inputHashes
BugSellStructuredPayload
preflightResult
preflightAt
routeSelectedAt
providerStartedAt?
```

Không lưu cookie, token, raw DOM, full URL.

### DoD Browser experimental sửa

1. **20 consecutive staging jobs**, không chỉ 10.
2. Bộ fixture cố định:
   - text-only;
   - product image;
   - BugSell absent/present;
   - long generation;
   - one retry pre-submit;
   - cancel queued;
   - cancel running;
   - challenge;
   - download collision;
   - worker restart.
3. Mỗi success xác nhận:
   - đúng một provider submission;
   - đúng artifact;
   - MIME/magic bytes hợp lệ;
   - artifact thuộc đúng job;
   - terminal event duy nhất.
4. Login probe:
   - tối thiểu 100 labeled probes;
   - false-positive `<5%`;
   - false-negative báo riêng;
   - active probe trong 2 phút trước dispatch.
5. Zero silent route switch:
   - API-to-Browser;
   - Browser-to-API;
   - Browser adapter change;
   - connection change;
   - post-start seat/route migration.
6. Crash tests:
   - trước provider start;
   - ngay sau submit;
   - khi download;
   - trước complete.
7. Security tests:
   - token absent page JS/log/bundle;
   - path traversal rejected;
   - extension/recipe hash mismatch hard-fail;
   - raw URL/query redacted.
8. API regression:
   - existing golden tests unchanged;
   - latency/error/artifact quality không giảm ngoài baseline đã chốt.

### Ship verdict

**Conditional GO.**

Blockers:

- Full lease protocol.
- Provider-start semantics.
- Artifact isolation.
- 100 labeled auth probes.
- Hash-pinned local assets.
- API regression pass.
- Kill switch.
- No-silent-switch matrix pass.

Không đạt: API-only ship. Browser giữ disabled experimental flag.

## E. Câu hỏi ép

1. “Storyboard-like” có fixture manifest cụ thể nào?
2. Provider acknowledgment nào xác lập `providerStartedAt`?
3. 100 labeled login probes lấy từ bao nhiêu auth states, bao nhiêu ngày?
4. Ai xác nhận false-positive ground truth?
5. API quality baseline gồm artifact quality metric nào?
6. Failure matrix có owner cho từng `errorCode` chưa?
7. Browser kill switch ai có quyền bật; propagation tối đa bao lâu?
8. Support bundle đã có golden redaction test chưa?
9. Worker crash sau submit reconcile bằng dấu hiệu/provider ID nào?
10. Nếu chưa giải được duplicate-submit detection, có chấp nhận Browser chỉ internal alpha thay vì user-visible experimental không?

---

## Vòng 12 — GROK

# Vòng 12 — GROK (Mid-final synthesis + open fights)

## Closed consensus (tôi liệt kê — sửa nếu sai)
1. Phase1 primary-only, app-owned profile
2. Taxonomy Capability → Provider → Connection
3. Grok Video API default; Browser experimental opt-in; no silent fallback
4. ChatGPT/Gemini/Flow hidden until vertical slice ready
5. Preflight blocks Submit; wizard hard-gates Browser route only
6. Probe passive 15m / active 2m
7. BugSell optional structured context + payload preview
8. Immutable snapshot after dispatch
9. Bridge lease required before Browser ship
10. Pool only after metrics gate

## Open fights còn lại
A) Bridge-shell-only vs require grok-automation-ext Phase1
B) Mixed batch API+Browser
C) Clone-with-cookies vs fresh seats Phase2
D) Progress % honesty

## Yêu cầu
Với mỗi open fight: pick 1 side + 2-sentence why. Sau đó đề xuất **PR plan 5 PR** ordered.

---

## Vòng 12 — CX_AGY

## A. Đồng ý có điều kiện

Consensus đúng. Sửa hai chốt:

- `Preflight blocks Submit` chỉ áp dụng **connection được chọn**; API không bị Browser wizard chặn.
- Snapshot tạo lúc dispatch transaction; từ đó immutable. Retry tạo `attempt` mới, không sửa snapshot.

## B. Phản biện — chốt open fights

### A) Chọn **Bridge-shell-only + CDP Phase 1**

CDP đã đủ launch, probe, automation, download; bắt buộc `grok-automation-ext` tăng supply-chain, packaging, drift. Chỉ thêm extension khi CDP thiếu capability cụ thể, có test chứng minh.

### B) Chọn **reject mixed API+Browser batch**

Một batch, một route giữ queue, cancel, provenance, support dễ hiểu. User tách hai batch; không auto-split, không silent route selection.

### C) Chọn **fresh seats Phase 2**

Không clone cookies, Local Storage, token, user-data; mỗi seat profile sạch, login riêng. Session cloning tăng corruption, replay, account lock, ToS, ban-wave risk.

### D) Chọn **stage labels, không progress %**

Browser UI không cung cấp denominator đáng tin; phần trăm sẽ là dữ liệu bịa. Hiển thị stage, elapsed time, attempt, challenge, stalled state.

## C. Best practice

- Extension: decision record `not required`, không scaffold.
- Batch route: immutable ở parent; child kế thừa.
- Seat template: chỉ policy, pinned assets, preferences không nhạy cảm.
- Progress: `Queued`, `Checking browser`, `Submitting`, `Waiting`, `Downloading`, `Saving`, `Completed`.
- Không đổi route, connection, seat giữa attempt.
- Passive probe 15 phút cho UX; active probe tối đa 2 phút tại dispatch.
- Browser wizard hard-gate; API route độc lập.

## D. PR plan — 5 PR ordered

### PR1 — Domain contract + persistence

- Thêm `Capability → Provider → Connection`.
- Job snapshot immutable.
- Attempt, lease, fencing token, typed states/errors.
- Browser primary-only constraint.
- Migration + DB invariant một active Browser attempt.
- Runnable checks: snapshot immutability, lease race, no route mutation.

**Ship:** backend dormant. Không UI, không automation.

### PR2 — Composer + route honesty

- Grok Video API mặc định.
- Grok Browser sau experimental opt-in.
- Connection-specific preflight.
- Browser-only wizard hard-gate.
- BugSell structured optional chip + exact payload preview.
- Batch single-route validation.
- No-silent-fallback tests.

**Ship:** Browser submit vẫn feature-flag off.

### PR3 — Bridge shell + primary CDP

- App-owned primary launch.
- OS-keychain credential reference.
- `next`, `heartbeat`, `running`, `complete`, `fail`, `cancel_requested`.
- Passive 15 phút, active 2 phút.
- Exclusive profile/seat lock.
- Grok CDP adapter, artifact isolation, hash validation.
- Không `grok-automation-ext`.

**Ship:** staging/internal flag only.

### PR4 — Queue + truthful UX

- Browser concurrency `1`.
- FIFO Browser queue; API pool giữ nguyên.
- Browser batch serialize; API batch fan-out.
- Queued cancel atomic; running cancel best-effort + reconciliation.
- Global running/queued indicator.
- Stage labels; không `%`.
- Failure matrix + typed remediation.

**Ship:** internal alpha; run crash/cancel/duplicate tests.

### PR5 — Observability + release gate

- Canonical transition events.
- Activity feed + mini timeline.
- Redacted support bundle allowlist.
- Extension field báo `not_applicable`; không fake drift telemetry.
- Kill switches global/workspace/adapter.
- API regression gate.
- Browser DoD: 20 consecutive fixtures, 100 labeled login probes, zero silent switch.

**Ship:** Browser experimental opt-in nếu toàn gate đạt; nếu fail, API-only.

## E. Câu hỏi ép

1. Có CDP capability nào đã biết bắt buộc extension không? Không có: xóa extension khỏi Phase 1.
2. Snapshot nằm ở parent batch, child job, attempt hay cả ba? Đề xuất: route/input ở child snapshot; runtime ở attempt.
3. Browser batch cancel mặc định hủy queued remainder בלבד hay cả running item?
4. Active preflight fail có giữ batch queued hay fail toàn batch?
5. Ai sở hữu kill switch; propagation SLA bao nhiêu?
6. `providerStartedAt` dựa trên tín hiệu Grok nào đủ chống duplicate?
7. Phase 1 public experimental hay internal alpha nếu chưa reconcile được post-submit crash?

---

## Vòng 13 — GROK

# Vòng 13 — GROK (chốt open fights + PR order)

## Chấp nhận R12 picks (confirm)
A) Bridge-shell + CDP Phase1; grok-automation-ext = installed pack optional, not control plane
B) Mixed batch: **split** thành 2 queues (API batch + Browser serial), không reject cả batch, UI hiện 2 progress
C) Phase2 seats: **fresh login**, never clone cookies
D) Progress: **stage labels only**

## PR plan 5 (Grok đề xuất — chỉnh)
PR1: Capability→Provider→Connection UI + preflight types (no browser runtime yet)
PR2: Web BFF bridge lease next/heartbeat/complete + workspace job store
PR3: App-owned primary launch + CDP smoke + seat state machine
PR4: Grok Browser experimental recipe path + wizard hard-gate + download artifacts
PR5: BugSell structured context + provenance + support bundle redaction

## Thách
1) PR order có đảo PR4/PR5 không? BugSell độc lập API path → có thể PR1.5?
2) Regression tests bắt buộc trước PR3?

---

## Vòng 13 — CX_AGY

## A. Chốt

- **Không đảo PR4/PR5 toàn bộ.**
- BugSell độc lập API path: đưa vào **PR1.5**, nhỏ, không chặn Browser runtime.
- Regression tests: **bắt buộc trước PR3**, nhưng thuộc PR0/test harness, không thêm PR thứ sáu.

## B. Phản biện

- PR1 UI trước contract/backend dễ tạo fake state.
- PR2 bridge trước regression dễ khóa protocol sai.
- PR3 launch/CDP thiếu artifact/provenance contract sẽ khó debug.
- PR5 để cuối làm support bundle quá muộn; cần event/redaction contract trước Browser.
- Mixed batch split đã đổi consensus: parent phải giữ grouping, child queue độc lập; không giả vờ atomic batch.

## C. Best practice

- PR0: API regression + contract tests.
- PR1: domain contract, snapshot, route/preflight types, Composer.
- PR1.5: BugSell structured payload + preview; API-only.
- PR2: workspace job store + bridge lease protocol.
- PR3: app-owned launch, CDP smoke, artifact contract, seat state machine.
- PR4: Browser recipe, wizard, queue, download, failure UX.
- PR5: provenance, redaction, kill switch, release gates.

## D. PR plan chốt

### PR0 — Regression safety

Bắt buộc trước PR3:

- Grok API golden tests.
- Existing quality/latency/error baseline.
- Capability/provider/connection contract tests.
- Snapshot immutability.
- No-silent-fallback matrix.
- Lease race tests.
- Mixed-batch split tests:
  - API child queue;
  - Browser serial queue;
  - independent progress;
  - parent aggregate status.
- Redaction unit tests tối thiểu.

**Fail:** không bắt đầu PR3. Không đổi API path để “lách” test.

### PR1 — Composer + contracts

- `Capability → Provider → Connection`.
- Connection-scoped preflight.
- API default.
- Browser experimental flag type.
- Parent/child batch model.
- Immutable child snapshot at dispatch.
- Stage state enum.
- Browser runtime absent.

### PR1.5 — BugSell

- Optional structured context.
- Exact payload preview.
- Snapshot payload hash.
- API path unchanged.
- Empty/invalid input validation.
- No Browser dependency.

### PR2 — Bridge backend

- Workspace job store.
- `next`, `heartbeat`, `running`, `complete`, `fail`, `cancel_requested`.
- Lease expiry + fencing.
- Attempt/provider-start boundary.
- Parent aggregate status.
- Separate API/Browser queues.
- Redacted event schema.

### PR3 — App-owned runtime

- Primary launch.
- CDP attach.
- Profile lock.
- Seat state machine:
  `provisioning/ready/leased/running/draining/blocked`.
- Artifact directory isolation.
- Download integrity validation.
- CDP smoke only; no user-visible Browser route.

### PR4 — Browser experimental

- Grok recipe path.
- Wizard hard-gate Browser only.
- Active/passive probes.
- Browser concurrency `1`, FIFO.
- Mixed batch split UI, two progress tracks.
- Stage labels only.
- Typed failure matrix.
- Cancel/reconcile behavior.
- No silent fallback.

### PR5 — Release hardening

- Provenance timeline.
- Redacted support bundle.
- Kill switch.
- Auth false-positive gate.
- 20-fixture consecutive-job gate.
- Crash-after-submit reconciliation.
- API regression rerun.
- Experimental rollout flag.

## E. Câu hỏi ép

1. Mixed batch parent có cho “Cancel all” không, hay cancel từng queue?
2. Một child Browser fail có làm API children tiếp tục không? Đề xuất: **có**.
3. `complete` có kèm artifact manifest + checksum không? Đề xuất: bắt buộc.
4. PR0 chạy trên CI nào; API golden fixture có version pin không?
5. Bridge lease expiry xử lý artifact late event bằng fencing token nào?
6. BugSell payload preview có redaction trước khi hiển thị/log không?
7. PR3 smoke có real staging seat hay mock CDP? Đề xuất: cả hai; mock nhanh, staging gate trước PR4.

---

## Vòng 14 — GROK

# Vòng 14 — GROK (UX copy final + empty/error states)

## Copy chuẩn (EN UI product)
- Connection: `via API` / `via Browser (Experimental)`
- Ready: `Ready`
- Needs login: `Sign in required` + button `Open Grok`
- Busy: `Browser busy — job in queue (#2)`
- Offline: `Browser seat offline` + `Start seat`
- Drift: `Update browser pack`
- BugSell selected: `BugSell · {title}`
- Applied: `Product context applied to this job`
- Remove: `Removed for future jobs. Queued jobs unchanged.`
- Mixed batch notice: `5 items → 3 via API, 2 via Browser (one at a time)`

## Empty states
- No API credential: connect Grok OAuth
- No browser seat: Prepare seat wizard
- No product: optional continue

## Thách
Phản biện microcopy nào mơ hồ / đổ lỗi user? Sửa 3 câu tệ nhất.

---

## Vòng 14 — CX_AGY

**(A) Đồng ý**

- `via API`, `via Browser (Experimental)`: rõ.
- `Ready`: đủ khi nằm cạnh connection.
- BugSell chip, applied, remove: rõ; phản ánh snapshot.
- Mixed batch: trung thực.
- No product: cho tiếp tục; không warning giả.

**(B) Phản biện**

- `Sign in required`: hơi quy lỗi user; nguyên nhân có thể session hết hạn, probe sai.
- `Browser seat offline`: thuật ngữ nội bộ; không nói app hay browser cần chạy.
- `Update browser pack`: mơ hồ; ai cập nhật, cập nhật gì, vì sao bị chặn.
- `Start seat`: thuật ngữ kỹ thuật, không khớp mental model.
- `connect Grok OAuth`: có thể sai kỹ thuật. Nếu API dùng key, đừng gọi OAuth.
- `Browser busy`: có thể không phải browser toàn cục; chỉ Grok Browser connection đang bận.
- `(#2)`: mơ hồ là vị trí hay job ID.
- `Open Grok`: mở trang chưa chắc giải quyết session hết hạn; wizard cần recheck.
- `Queued jobs unchanged`: đúng; nên thêm running jobs nếu thao tác cũng không tác động.
- `one at a time`: nên gắn rõ Browser items.

**(C) Sửa 3 câu tệ nhất**

1. Login:

```text
Grok sign-in needed
```

Button:

```text
Open Grok to sign in
```

Sau quay lại:

```text
Check again
```

Ít quy lỗi; hành động rõ.

2. Offline:

```text
Browser connection unavailable
```

Button:

```text
Start browser
```

Nếu app thực sự start shell. Nếu không:

```text
Open setup
```

Không dùng `seat` với end user.

3. Drift:

```text
Browser automation update required
```

Button:

```text
Update now
```

Helper:

```text
Update before sending jobs via Browser.
```

Không dùng `pack` chưa được giải thích.

**(D) Copy chốt bổ sung**

Busy:

```text
Browser connection busy — queue position 2
```

Mixed batch:

```text
5 items: 3 via API, 2 via Browser one at a time
```

No API credential, dùng copy trung lập kỹ thuật:

```text
Grok API connection required
```

Button theo cơ chế thật:

```text
Connect Grok
```

No browser:

```text
Browser connection not set up
```

Button:

```text
Set up Browser
```

No product:

```text
Product context is optional
```

Button:

```text
Continue without product context
```

Remove nên chính xác hơn:

```text
Removed from future jobs. Queued and running jobs are unchanged.
```

**(E) Consensus shift**

- End-user UI bỏ `seat`, `pack`, `(#2)`.
- Dùng `Browser connection`, `browser automation`, `queue position 2`.
- `OAuth` chỉ hiện nếu Grok API thực sự dùng OAuth.
- Login copy chuyển từ phán trạng thái user sang nhu cầu hệ thống.

---

## Vòng 15 — GROK

# Vòng 15 — GROK (Test strategy)

## Layers
1. Unit: taxonomy routing, snapshot immutability, probe TTL math
2. Contract: bridge next/complete schema
3. Integration: mock CDP + mock bridge
4. E2E manual: real Grok login seat (opt-in CI)
5. Regression: existing Grok API video commercial path must stay green

## Forbidden tests
- Tests that hit production Grok web without flag
- Tests that clone real user Chrome profile

## Thách
Minimum automated gate trước merge PR4?

---

## Vòng 15 — CX_AGY

**(A) Chốt gate tối thiểu**

PR4 merge chỉ khi CI bắt buộc xanh:

1. Unit.
2. Bridge contract đầy đủ.
3. Mock CDP integration.
4. Mixed-batch integration.
5. Grok API regression.
6. Security/redaction checks.

Real Grok E2E không bắt buộc merge; bắt buộc bật experimental rollout.

**(B) Lỗ hổng**

- Contract chỉ `next/complete`: thiếu `heartbeat/running/fail/cancel_requested`, lease expiry, fencing.
- Mock happy-path: không đủ; cần crash, timeout, stale completion.
- “E2E manual” không phải automated gate.
- Opt-in CI không bảo vệ PR nếu mặc định không chạy.
- API “stay green” cần pinned fixtures, baseline rõ.
- Production Grok cấm mặc định: đúng. Dùng staging/test account khi explicit flag.

**(C) Test matrix tối thiểu**

| Nhóm | Case bắt buộc |
|---|---|
| Routing | API default; Browser opt-in; no silent fallback |
| Snapshot | Immutable sau dispatch; retry tạo attempt mới |
| Probe | 15m passive; 2m active; stale/fail block Browser |
| Lease | Exclusive claim; heartbeat; expiry; fencing chặn stale completion |
| Bridge | Schema/version/error cho mọi endpoint |
| CDP | launch, attach, login states, submit, download, checksum |
| Failure | offline, drift, challenge, timeout, crash trước/sau submit |
| Queue | Browser max `1`; FIFO; queued cancel |
| Mixed batch | Split `3 API/2 Browser`; độc lập; parent aggregate đúng |
| Artifact | Per-job isolation; wrong MIME/job/repeated completion bị reject |
| Security | Token/log/URL redaction; traversal reject |
| Regression | Grok API commercial video golden path |

**(D) Merge rule**

```text
required:
  unit
  bridge-contract
  mock-cdp-integration
  mixed-batch-integration
  security-redaction
  grok-api-regression
```

Flaky test: fail gate; không rerun-until-green. Real-seat smoke: explicit flag, isolated fresh seat, no production user profile; chạy trước rollout và theo lịch canary.

**(E) Consensus shift**

- Bridge contract gate mở rộng toàn lease lifecycle.
- Real Grok smoke tách **merge gate** khỏi **release gate**.
- PR4 merge không đồng nghĩa Browser bật cho user.

---

## Vòng 16 — GROK

# Vòng 16 — GROK (Role of vendored 4 exts after consensus)

## Clarified product story
User said integrate all exts. Consensus thu hẹp Phase1.
Communication:
- Ext packs = **future capability inventory** vendored now
- Phase1 only activates Grok Browser experimental + install path for packs
- ChatGPT/Gemini/Flow = `coming soon` in registry, not fake-enabled

## Risk
User disappointment if UI promises 4 logos.

## Mitigation
Registry shows status: `active_api` | `experimental_browser` | `vendored_inactive`

## Thách
Có hiện 4 logos grayed hay ẩn hẳn Phase1?

---

## Vòng 16 — CX_AGY

**(A) Quyết định**

Ẩn 3 logo inactive khỏi UI Phase1. Chỉ hiện Grok:

- `via API`
- `via Browser (Experimental)`

Vendored inventory thuộc diagnostics/admin, không phải product surface.

**(B) Phản biện**

- Logo grayed vẫn là lời hứa sản phẩm.
- `coming soon` ngụ ý roadmap cam kết; chưa có scope, owner, ngày.
- `vendored_inactive` là trạng thái đóng gói, không phải capability user dùng được.
- “Install path for packs” không nên lộ nếu Phase1 không kích hoạt pack.
- Vendor code sớm tăng security review, license, update, supply-chain burden. Nếu không cần install verification: đừng ship binary; giữ source pin/manifest.

**(C) Mô hình trạng thái**

Tách internal packaging khỏi user capability:

```text
package_status: absent | vendored | verified | blocked
capability_status: unavailable | experimental | active
```

UI chỉ render:

```text
capability_status ∈ {experimental, active}
```

Không suy capability từ `package_status`.

**(D) Actionable**

1. User UI: chỉ Grok.
2. Admin diagnostics: bảng 4 pack, version, checksum, license, verification; nhãn `Inactive`.
3. Registry API public: lọc `unavailable`.
4. Không dùng `coming soon`; dùng `Not available` trong diagnostics nếu cần.
5. Không load, inject, cấp quyền, update inactive packs.
6. Không telemetry “usage” cho inactive packs; chỉ integrity/install diagnostics.
7. Release notes:

```text
Phase 1 enables Grok API and experimental Grok Browser. Other vendored browser packs are inactive and unavailable.
```

**(E) Consensus shift**

- Phase1 user UI không hiện 4 logo.
- `vendored_inactive` đổi thành internal packaging state.
- Không coi “vendored now” là “integrated”.
- Nếu vendor chưa phục vụ verification/contract test cụ thể: hoãn vendor; lưu pinned inventory manifest בלבד.

---

## Vòng 17 — GROK

# Vòng 17 — GROK (Residual risks ranking)

## Top risks (Grok rank)
1. Login probe false Ready → wasted jobs / ban risk
2. Grok web UI churn breaks recipes
3. Scope creep re-adding pool/ChatGPT before bridge solid
4. User treats Experimental as production quality
5. Cookie crown-jewel compromise on shared machine

## Mitigations mapped
1. Active probe 2m + stage fail fast
2. Pin selectors + quick disable flag
3. Phase gate metrics + feature flags
4. Badge + docs + no default browser for video
5. App-owned ACL + reset confirm

## Thách
Reorder top 3 nếu bạn khác. Một risk bị bỏ sót?

---

## Vòng 17 — CX_AGY

**(A) Top 3 sửa**

1. **Cookie/session compromise trên máy dùng chung.**
2. **Grok UI churn gây thao tác sai hoặc submit trùng.**
3. **Login probe false Ready gây job lỗi/challenge.**

Scope creep: rủi ro delivery, không cao bằng security/data integrity.

**(B) Phản biện mitigation**

- `ACL + reset confirm` chưa đủ. Cần OS keychain token, profile permissions, log redaction, không export cookie, auto-lock.
- Pin selector dễ vỡ cứng. Ưu tiên semantic locator, invariant checks, recipe version, kill switch.
- Probe 2m không chứng minh session còn hợp lệ lúc submit. Revalidate ngay trước side effect.
- Badge/docs không ngăn kỳ vọng sai. Browser không mặc định; wizard xác nhận giới hạn; rollout allowlist.

**(C) Risk bị sót**

**Ambiguous submit outcome gây duplicate job/cost.**

Crash/timeout sau click nhưng trước acknowledgment: retry có thể submit lần hai.

Mitigation:

1. Ghi `attempt_id` trước submit.
2. Chuyển `submitting` ngay trước click.
3. Sau crash: `reconcile_required`, không auto-retry.
4. Tìm artifact/conversation marker theo attempt.
5. Không xác minh được: hỏi user; không silent resubmit.

**(D) Gates**

- Security review fail: không phát hành Browser.
- Recipe invariant fail: kill switch Browser.
- Pre-submit auth fail: không click.
- Ambiguous submit: dừng queue child đó; API children tiếp tục.
- Scope additions: Phase2 RFC; không chen PR4.

**(E) Consensus shift**

Top risk đổi sang session security. Bổ sung `submitting/reconcile_required`; cấm auto-retry sau submit không rõ kết quả.

---

## Vòng 18 — GROK

# Vòng 18 — GROK (Non-goals freeze)

## Explicit non-goals Phase1
- Multi-profile pool
- Auto account hop browser
- CAPTCHA solving
- Cookie import from personal Chrome
- Marketing "Browser better quality"
- Full FlowVeo reverse engineering
- Backend Nest dependency for local SocialOps path (BFF must stand alone)

## Thách
Thêm 2 non-goals quan trọng còn thiếu.

---

## Vòng 18 — CX_AGY

**(A) Thêm 2 non-goals**

1. **Không silent fallback/failover giữa Grok API và Browser.**
2. **Không tự retry/resubmit Browser khi kết quả submit chưa rõ.**

**(B) Lý do**

- Silent fallback đổi cost, auth, chất lượng, execution path ngoài ý user.
- Auto-resubmit có thể tạo duplicate, double charge, tăng ban risk.
- Hai mục là ranh giới sản phẩm; không chỉ chi tiết triển khai.

**(C) Scope chính xác**

```text
- No automatic fallback or failover between Grok API and Browser.
- No automatic retry or resubmission after an ambiguous Browser submit outcome; require reconciliation or explicit user action.
```

Retry trước side effect vẫn cho phép: probe, attach CDP, fetch queue. Retry sau click: cấm mặc định.

**(D) Enforcement**

- Route lưu trong immutable job snapshot.
- `submitting` mất acknowledgment chuyển `reconcile_required`.
- UI yêu cầu user chọn `Mark complete`, `Retry`, `Cancel`.
- Kill switch chỉ chặn job Browser mới; không chuyển sang API.
- Contract test khóa hai invariant.

**(E) Consensus shift**

Non-goals tăng từ 7 lên 9. Freeze Phase1; thay đổi cần RFC Phase2.

---

## Vòng 19 — GROK

# Vòng 19 — GROK (Joint decision record draft)

## ADR-001 Browser seats (draft)
Context: integrate automation exts + multi-profile ambition into SocialOps.
Decision: Phase1 primary app-owned seat; API-first Grok video; Browser experimental via bridge+CDP; Cap→Prov→Conn UX; BugSell structured optional.
Consequences: slower multi-ext rollout; higher trust UX; lower eng thrash.

## Thách
Viết lại Consequences phần negative candid hơn. Approve/Request changes ADR.

---

## Vòng 19 — CX_AGY

**(A) Verdict**

**Request changes.** Decision đúng. Consequences quá quảng bá; thiếu chi phí, giới hạn, failure modes.

**(B) Consequences viết lại**

```md
## Consequences

### Positive
- Grok API remains the default, predictable production path.
- Browser automation stays explicit, isolated, observable, kill-switchable.
- One app-owned seat reduces profile ambiguity and concurrent-session failures.
- Cap→Prov→Conn exposes capability, provisioning, and connectivity failures separately.
- Structured BugSell data remains optional; core execution does not depend on it.

### Negative
- Phase 1 does not deliver multi-profile pooling, account hopping, or active ChatGPT/Gemini/Flow automation.
- Vendored inactive extension packs provide no user-facing capability and still incur license, security-review, integrity, update, and repository-maintenance costs.
- The app-owned browser seat requires a separate login and cannot reuse or import the user's personal Chrome profile or cookies.
- Browser jobs are serialized to one concurrent job, reducing throughput and increasing queue latency.
- Grok web UI changes may disable Browser automation without notice; selector or recipe maintenance is ongoing operational work.
- Login probes can report stale readiness. Authentication may still fail or trigger a challenge immediately before submission.
- Ambiguous submit outcomes cannot be retried safely. Jobs may stop in `reconcile_required` and require explicit user resolution.
- Browser automation offers weaker reliability, supportability, and SLA expectations than the API path.
- Local session material remains security-sensitive on shared or compromised machines despite app-owned isolation, ACLs, keychain tokens, and redaction.
- Phase 1 excludes silent API/Browser fallback. Failures remain visible and may require rerouting or retrying by the user.
- Bridge, CDP, browser-version, and OS compatibility expand the test matrix and support burden.
- Experimental rollout may be disabled globally when recipe invariants, security gates, or upstream behavior fail.
```

**(C) Thiếu trong ADR**

Thêm:

```md
## Non-goals
## Security assumptions
## Failure semantics
## Release and rollback gates
```

Không nhét implementation matrix. Link tài liệu test/contract.

**(D) Điều kiện approve**

1. Thay Consequences.
2. Ghi Browser không có production SLA Phase1.
3. Ghi inactive packs không đồng nghĩa integrated/enabled.
4. Ghi `reconcile_required`; cấm auto-resubmit.
5. Ghi kill switch, no silent fallback.
6. Ghi Phase2 fresh seats; không clone user-data.

**(E) Consensus shift**

Không đổi quyết định kỹ thuật. ADR chuyển từ optimistic summary sang trade-off record. Approve sau chỉnh sửa trên.

---

## Vòng 20 — GROK

# Vòng 20 — GROK (FINAL — joint statement)

Hãy xuất **TOÀN BỘ** document chốt cuối:

# CONSENSUS FINAL — SocialOps Ext Integration
## 1. Product principles (max 8)
## 2. Phase 1 scope (in/out)
## 3. UX rules (must)
## 4. Architecture rules (must)
## 5. BugSell rules
## 6. Multi-profile roadmap (Phase2 only)
## 7. PR sequence (5)
## 8. DoD / metrics gates
## 9. Residual risks (top 5)
## 10. One-paragraph joint commitment (Grok×CX_AGY)

Không mở fight mới. Chỉ chốt. Nếu còn 1 bất đồng: ghi "Disagree:" và majority pick.

---

## Vòng 20 — CX_AGY

**(A) Tài liệu chốt**

# CONSENSUS FINAL — SocialOps Ext Integration

## 1. Product principles

1. **API-first.** Grok API mặc định; Browser Experimental.
2. **Explicit routing.** Không silent fallback/failover API–Browser.
3. **App-owned isolation.** Phase1 dùng một browser seat riêng do app quản lý.
4. **Capability truth.** Chỉ hiển thị capability thực sự dùng được; không logo giả kỳ vọng.
5. **Fail visible.** Lỗi auth, connection, submit phải rõ; không che bằng retry nguy hiểm.
6. **Security before convenience.** Không import cookie, clone personal profile, CAPTCHA solving.
7. **Minimum scope.** Bridge vững trước pool, account hopping, provider mới.
8. **Reversible rollout.** Feature flag, recipe version, invariants, kill switch.

## 2. Phase 1 scope

### In

- Grok API: production-default video path.
- Grok Browser: Experimental, opt-in.
- Một app-owned browser seat.
- Browser bridge-shell + CDP.
- `grok-automation-ext`: không bắt buộc.
- Wizard Cap→Prov→Conn.
- Browser wizard hard gate trước job đầu tiên.
- Login/readiness probe:
  - Cache tối đa 15 phút.
  - Active probe tối đa 2 phút.
  - Revalidate ngay trước side effect.
- Tối đa một Browser job đồng thời.
- Recipe versioning, semantic locators, invariant checks, kill switch.
- Stage labels thực; không phần trăm giả.
- Bridge token lưu OS keychain.
- BugSell structured metadata tùy chọn.
- Trạng thái `submitting`, `reconcile_required`.
- Diagnostics nội bộ cho pack vendored/inactive.

### Out

- Multi-profile pool.
- Auto account hopping.
- CAPTCHA solving.
- Import cookie từ personal Chrome.
- Clone user-data/profile.
- Marketing Browser có chất lượng tốt hơn.
- Production SLA cho Browser.
- Full FlowVeo reverse engineering.
- Backend Nest dependency cho local SocialOps path; BFF phải đứng độc lập.
- Silent fallback/failover API–Browser.
- Auto-retry/resubmit khi Browser submit chưa rõ kết quả.
- User-facing ChatGPT/Gemini/Flow capability inactive.
- Logo `coming soon` cho capability chưa cam kết.

## 3. UX rules

- Grok API được chọn mặc định.
- Browser luôn gắn nhãn `Experimental`.
- Browser video không là mặc định.
- Wizard trình bày đúng thứ tự:
  1. Capability.
  2. Provisioning.
  3. Connectivity.
- Browser chưa qua hard gate: không cho chạy.
- Route, account/seat, giới hạn Browser phải hiện trước submit.
- Không tự đổi route sau lỗi.
- Stage dùng nhãn thực: `Queued`, `Connecting`, `Authenticating`, `Submitting`, `Waiting`, `Completed`, `Failed`, `Reconciliation required`.
- Không hiển thị phần trăm nếu không có progress đo được.
- Auth challenge, probe stale, kill switch phải có lỗi actionable.
- `reconcile_required`: user chọn `Mark complete`, `Retry`, `Cancel`; không auto-resubmit.
- Reset seat cần xác nhận rõ; cảnh báo mất session.
- UI Phase1 chỉ hiện Grok API, Grok Browser. Inactive packs chỉ xuất hiện trong diagnostics/admin.

## 4. Architecture rules

- Primary seat thuộc app; profile directory riêng.
- Bridge-shell kết nối browser qua CDP.
- Không yêu cầu `grok-automation-ext`.
- Bridge token nằm trong OS keychain; không plaintext config.
- Profile/session material dùng OS ACL phù hợp.
- Không export cookie; không ghi cookie/token vào log.
- Job snapshot khóa route sau khi tạo.
- Browser concurrency hard-limit: `1`.
- Readiness không chỉ dựa cache; pre-submit auth check bắt buộc.
- Side effect có `attempt_id` được ghi trước submit.
- Timeout/crash sau submit chuyển `reconcile_required`.
- Không auto-retry sau outcome không xác định.
- Recipe có version, semantic locator, pre/post-condition, quick-disable flag.
- Invariant fail: chặn Browser job mới; không chuyển sang API.
- Internal states tách biệt:

```text
package_status: absent | vendored | verified | blocked
capability_status: unavailable | experimental | active
```

- UI chỉ render `experimental` hoặc `active`.
- Inactive packs không được load, inject, cấp quyền, tự update.
- BFF local path hoạt động độc lập với Nest backend.
- Security gate fail: Browser không phát hành.

## 5. BugSell rules

- Structured BugSell metadata tùy chọn.
- Thiếu BugSell không chặn core execution.
- Thu thập tối thiểu cần thiết: recipe version, stage, sanitized error, browser/OS compatibility, correlation ID.
- Không thu cookie, token, DOM chứa dữ liệu nhạy cảm, nội dung cá nhân mặc định.
- User xem và xác nhận dữ liệu gửi nếu có payload mở rộng.
- Log redaction bắt buộc.
- Inactive packs chỉ phát integrity/install diagnostics; không phát usage telemetry giả.
- BugSell không được trở thành hidden runtime dependency.

## 6. Multi-profile roadmap — Phase2 only

- Chỉ bắt đầu sau khi Phase1 đạt gates liên tiếp.
- Dùng fresh app-owned seats.
- Không clone user-data.
- Không import personal Chrome cookies.
- Mỗi seat có profile directory, keychain secret, lifecycle, health state riêng.
- Pool scheduler, lease, recovery, account policy cần threat model riêng.
- Account hopping không mặc định; phải phù hợp provider policy.
- Concurrency tăng chỉ sau load, ban-risk, reconciliation testing.
- ChatGPT/Gemini/Flow activation cần capability contract, security review, owner, rollback riêng.

## 7. PR sequence

1. **PR1 — Capability registry**
   - `package_status`, `capability_status`.
   - Grok-only user surface.
   - Feature flags.
   - Inactive-pack diagnostics.

2. **PR2 — App-owned seat + bridge**
   - Profile isolation.
   - bridge-shell + CDP.
   - OS keychain token.
   - ACL, redaction, reset flow.

3. **PR3 — Cap→Prov→Conn wizard**
   - Browser hard gate.
   - 15m/2m probes.
   - Actionable auth/connectivity errors.
   - Experimental disclosure.

4. **PR4 — Browser job execution**
   - Concurrency `1`.
   - Recipe version/invariants.
   - Pre-submit revalidation.
   - `attempt_id`, `submitting`, `reconcile_required`.
   - Kill switch; no silent fallback.

5. **PR5 — Observability + release gates**
   - Stage labels.
   - BugSell optional payload.
   - Metrics dashboard.
   - Compatibility matrix.
   - Rollback drill, release documentation.

Mỗi PR độc lập reviewable. Không chen Phase2 scope.

## 8. DoD / metrics gates

### Functional

- Grok API vẫn hoạt động khi Browser disabled/uninstalled.
- Browser chạy qua bridge-shell + CDP mà không cần `grok-automation-ext`.
- Wizard chặn job khi Cap, Prov hoặc Conn fail.
- Một Browser job chạy; job thứ hai queue, không mở seat khác.
- Kill switch chặn job mới; không reroute.
- Ambiguous submit luôn vào `reconcile_required`.
- Không có fake progress.
- Inactive capability không xuất hiện trong user UI.

### Security

- Không secret/cookie trong config, logs, BugSell payload.
- Bridge token lấy từ OS keychain.
- Profile permissions vượt security review.
- Reset yêu cầu explicit confirmation.
- Không cookie import, profile clone, CAPTCHA automation.
- Threat model và rollback drill hoàn tất.

### Reliability metrics

- Probe false-Ready: `<1%` trên release test set.
- Wizard gate classification đúng: `≥99%`.
- Duplicate submission do auto-retry: `0`.
- Silent fallback: `0`.
- Browser concurrency vượt `1`: `0`.
- Secret leakage trong automated scans: `0`.
- Recipe invariant fail phải kích hoạt disable path trong `<5 phút`.
- API regression so với baseline: `0` release-blocking.
- Browser success rate được quan sát, không dùng làm production SLA Phase1.

### Release gate

- Security, functional, compatibility gates đều pass.
- Canary/allowlist trước rollout rộng.
- Hai chu kỳ release ổn định trước mọi Phase2 RFC.
- Critical security failure, duplicate submit, uncontrolled reroute: rollback ngay.

## 9. Residual risks

1. **Session compromise trên máy dùng chung.** Giảm bằng app-owned profile, ACL, keychain, redaction, reset; không loại bỏ trên OS đã bị compromise.
2. **Grok web UI churn.** Có thể phá recipe hoặc tạo thao tác sai; giảm bằng semantic locators, invariants, versioning, kill switch.
3. **False Ready/auth challenge.** Probe có thể stale ngay trước submit; giảm bằng active probe, pre-submit revalidation, fail-fast.
4. **Ambiguous submit outcome.** Crash/timeout có thể che kết quả; giảm bằng `attempt_id`, `reconcile_required`, cấm auto-resubmit.
5. **Experimental bị hiểu như production.** Giảm bằng opt-in, badge, wizard disclosure, API default, không production SLA.

## 10. Joint commitment — Grok×CX_AGY

Grok×CX_AGY cam kết ship Phase1 nhỏ, minh bạch, an toàn: Grok API là đường mặc định; Browser là Experimental qua app-owned seat, bridge-shell + CDP, Cap→Prov→Conn hard gate, một job đồng thời, không silent fallback, không retry submit mơ hồ. Capability chưa hoạt động không được quảng bá. Session security, truthful UX, kill switch, measurable release gates đứng trước tốc độ mở rộng. Multi-profile, fresh seats, provider mới chỉ vào Phase2 sau khi bridge Phase1 chứng minh độ ổn định.

**(B) Disagree**

Không.

**(C) Trạng thái**

Approved.

**(D) Hành động**

Khóa ADR. Tách 5 PR đúng thứ tự. Scope mới chuyển Phase2 RFC.

**(E) Consensus shift**

Không đổi. Consensus cuối được đóng.

---

