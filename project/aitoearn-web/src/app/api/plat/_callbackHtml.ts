type CallbackState = 'success' | 'error' | 'pending'

type CallbackAccount = {
  id?: string
  name?: string
  username?: string
  avatar?: string
  platform?: string
}

export function oauthCallbackHtml(title: string, message: string, state: CallbackState = 'success', account?: CallbackAccount) {
  const safeTitle = escapeHtml(title)
  const safeMessage = escapeHtml(message)
  const color = state === 'success' ? '#10b981' : state === 'error' ? '#ef4444' : '#8b5cf6'
  const icon = state === 'success' ? '✓' : state === 'error' ? '!' : '…'
  const safeAccount = account
    ? {
        id: escapeHtml(account.id || ''),
        name: escapeHtml(account.name || account.username || ''),
        username: escapeHtml(account.username || ''),
        avatar: escapeHtml(account.avatar || ''),
        platform: escapeHtml(account.platform || ''),
      }
    : null
  const accountHtml = safeAccount && (safeAccount.id || safeAccount.name || safeAccount.avatar)
    ? `<section class="account">
        ${safeAccount.avatar ? `<img class="account-avatar" src="${safeAccount.avatar}" alt="${safeAccount.name || 'Connected account'}" referrerpolicy="no-referrer" />` : `<div class="account-avatar fallback">${safeAccount.name.slice(0, 1) || '✓'}</div>`}
        <div class="account-meta">
          <div class="account-label">Connected account</div>
          <div class="account-name">${safeAccount.name || safeAccount.username || safeAccount.id}</div>
          ${safeAccount.username ? `<div class="account-row"><span>Username</span><strong>${safeAccount.username}</strong></div>` : ''}
          ${safeAccount.id ? `<div class="account-row"><span>ID</span><strong>${safeAccount.id}</strong></div>` : ''}
          ${safeAccount.platform ? `<div class="account-row"><span>Platform</span><strong>${safeAccount.platform}</strong></div>` : ''}
        </div>
      </section>`
    : ''

  return new Response(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;color:#0f172a;font-family:"Inter",ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    body:before{content:"";position:fixed;inset:0;background-image:radial-gradient(circle,#dbe3ee 1px,transparent 1px);background-size:22px 22px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.9),rgba(0,0,0,.15));pointer-events:none}
    body:after{content:"";position:fixed;inset:auto 18% 12% 18%;height:220px;background:radial-gradient(circle,rgba(139,92,246,.16),transparent 62%);filter:blur(18px);pointer-events:none}
    .card{position:relative;width:min(520px,calc(100vw - 32px));border:1px solid rgba(226,232,240,.95);background:rgba(255,255,255,.88);border-radius:24px;padding:34px;box-shadow:0 34px 120px rgba(15,23,42,.16);backdrop-filter:blur(18px)}
    .brand{display:flex;align-items:center;gap:12px;margin-bottom:28px;font-weight:750;letter-spacing:-.03em}.logo{width:40px;height:40px;border-radius:12px;box-shadow:0 10px 28px rgba(15,23,42,.14)}
    .status{display:grid;place-items:center;width:64px;height:64px;border-radius:22px;background:${color}14;color:${color};font-size:34px;font-weight:850;margin-bottom:22px}
    h1{font-size:26px;line-height:1.12;margin:0 0 12px;letter-spacing:-.045em} p{font-size:15px;line-height:1.65;color:#475569;margin:0}
    .account{display:flex;gap:14px;align-items:flex-start;margin-top:22px;padding:16px;border:1px solid #e2e8f0;border-radius:18px;background:rgba(248,250,252,.82)}
    .account-avatar{width:54px;height:54px;border-radius:16px;object-fit:cover;background:#f1f5f9;box-shadow:0 10px 26px rgba(15,23,42,.12)}
    .account-avatar.fallback{display:grid;place-items:center;color:${color};font-weight:850;font-size:22px}.account-meta{min-width:0;flex:1}.account-label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;font-weight:800;margin-bottom:4px}.account-name{font-size:17px;font-weight:800;letter-spacing:-.035em;color:#0f172a;margin-bottom:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.account-row{display:grid;grid-template-columns:82px minmax(0,1fr);gap:10px;font-size:12px;line-height:1.5;color:#64748b}.account-row strong{min-width:0;color:#334155;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .hint{margin-top:24px;padding-top:20px;border-top:1px solid #e2e8f0;font-size:13px;color:#64748b}.actions{display:flex;gap:10px;margin-top:18px}.button{border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:12px;padding:10px 14px;font-size:13px;font-weight:750;text-decoration:none;cursor:pointer}.button.primary{border-color:#0f172a;background:#0f172a;color:#fff}
  </style>
</head>
<body>
  <main class="card">
    <div class="brand"><img class="logo" src="/logo.png" alt="Socials Hub" /><span>Socials Hub</span></div>
    <div class="status">${icon}</div>
    <h1>${safeTitle}</h1>
    <p>${safeMessage}</p>
    ${accountHtml}
    <div class="hint">Keep this window visible for app review. Return to Socials Hub after confirming the account details.</div>
    <div class="actions">
      <a class="button primary" href="/en/accounts">Return to Socials Hub</a>
      <button class="button" type="button" onclick="window.close()">Close window</button>
    </div>
  </main>
</body>
</html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#039;')
}
