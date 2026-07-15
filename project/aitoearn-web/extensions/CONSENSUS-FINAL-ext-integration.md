# Extracted from 20-round Grok × cx_agy debate

Source: cx_agy-plan-debate-20.md

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

