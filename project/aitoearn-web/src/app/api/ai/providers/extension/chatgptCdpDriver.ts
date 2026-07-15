/**
 * Drive ChatGPT (chatgpt.com) via CDP for ext:chatgpt:* jobs.
 * Real prompt submit + response extract — not navigate-only shell.
 */
import {
  CdpSession,
  getBrowserWsUrl,
  listCdpTargets,
} from '@/app/api/ai/providers/workspace/cdpClient'

export type ChatgptCdpDriveResult = {
  ok: boolean
  phase: string
  promptSubmitted?: boolean
  replyText?: string
  imageUrls?: string[]
  tabUrl?: string
  error?: string
  textSample?: string
}

async function sleep(ms: number) {
  await new Promise(r => setTimeout(r, ms))
}

function unwrapEval(r: any): any {
  if (r == null)
    return r
  if (typeof r === 'object' && 'value' in r && 'type' in r)
    return (r as { value: unknown }).value
  if (typeof r === 'object' && r.result && typeof r.result === 'object' && 'value' in r.result)
    return r.result.value
  return r
}

export async function driveChatgptViaCdp(input: {
  cdpEndpoint: string
  prompt: string
  /** Prefer image generation UI when true */
  imageMode?: boolean
  pollMs?: number
  pollRounds?: number
  onProgress?: (p: { percent: number, stage: string }) => void | Promise<void>
}): Promise<ChatgptCdpDriveResult> {
  const base = input.cdpEndpoint.replace(/\/$/, '')
  const report = async (percent: number, stage: string) => {
    try {
      await input.onProgress?.({ percent, stage })
    }
    catch { /* ignore */ }
  }

  let targets = await listCdpTargets(input.cdpEndpoint)
  let page = targets.find(t => t.type === 'page' && /chatgpt\.com|chat\.openai\.com/i.test(String(t.url || '')))

  if (!page) {
    await fetch(`${base}/json/new?${encodeURIComponent('https://chatgpt.com/')}`, {
      method: 'PUT',
      signal: AbortSignal.timeout(8000),
    }).catch(() =>
      fetch(`${base}/json/new?${encodeURIComponent('https://chatgpt.com/')}`, {
        signal: AbortSignal.timeout(8000),
      }),
    )
    await sleep(2000)
    targets = await listCdpTargets(input.cdpEndpoint)
    page = targets.find(t => t.type === 'page' && /chatgpt\.com|chat\.openai\.com/i.test(String(t.url || '')))
  }

  if (!page?.id) {
    return { ok: false, phase: 'no_chatgpt_tab', error: 'no_chatgpt_tab' }
  }

  const browserWs = await getBrowserWsUrl(input.cdpEndpoint)
  const session = new CdpSession(browserWs)
  try {
    await session.connect()
    const sessionId = await session.attachPage(page.id)
    await session.send('Runtime.enable', {}, sessionId)
    await session.send('Page.enable', {}, sessionId).catch(() => null)

    const evalJs = async (expression: string) => {
      const r = await session.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      }, sessionId)
      return unwrapEval(r)
    }

    await report(20, 'Opening ChatGPT…')
    await session.send('Page.navigate', { url: 'https://chatgpt.com/' }, sessionId)
    await sleep(4000)

    const loginCheck = await evalJs(`(() => {
      const t = (document.body?.innerText || '').slice(0, 500);
      const u = location.href;
      const needsLogin = /log in|sign up|đăng nhập/i.test(t)
        && !/new chat|log out|composer|message/i.test(t);
      return { needsLogin, u, t: t.slice(0, 200) };
    })()`)

    if (loginCheck?.needsLogin) {
      return {
        ok: false,
        phase: 'needs_login',
        error: 'ChatGPT requires login on this seat profile',
        tabUrl: String(loginCheck.u || ''),
        textSample: String(loginCheck.t || ''),
      }
    }

    await report(35, 'Filling ChatGPT prompt…')
    const prompt = String(input.prompt || '').slice(0, 8000)
    const fill = await evalJs(`(() => {
      const prompt = ${JSON.stringify(prompt)};
      const box =
        document.querySelector('#prompt-textarea')
        || document.querySelector('[data-testid="prompt-textarea"]')
        || document.querySelector('div[contenteditable="true"]#prompt-textarea')
        || document.querySelector('div[contenteditable="true"][data-placeholder]')
        || [...document.querySelectorAll('div[contenteditable="true"], textarea')].find(el => {
          const a = (el.getAttribute('placeholder') || '') + (el.getAttribute('aria-label') || '') + (el.getAttribute('data-placeholder') || '');
          return /message|prompt|ask|chat/i.test(a) || el.id === 'prompt-textarea';
        });
      if (!box) return { ok:false, error:'no_composer' };
      box.focus();
      box.click();
      if (box.tagName === 'TEXTAREA') {
        const proto = window.HTMLTextAreaElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        desc?.set?.call(box, prompt);
        box.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        box.textContent = '';
        document.execCommand('insertText', false, prompt);
        if (!(box.textContent || '').includes(prompt.slice(0, 20))) {
          box.textContent = prompt;
          box.dispatchEvent(new InputEvent('input', { bubbles: true, data: prompt }));
        }
      }
      const text = (box.textContent || box.value || '').trim();
      return { ok: text.length >= 5, len: text.length, text: text.slice(0, 80) };
    })()`)

    if (!fill?.ok) {
      return {
        ok: false,
        phase: 'prompt_fill_failed',
        error: fill?.error || 'could_not_fill_chatgpt_prompt',
        tabUrl: String(await evalJs('location.href') || ''),
      }
    }

    await sleep(300)
    const submitted = await evalJs(`(() => {
      const btn =
        document.querySelector('[data-testid="send-button"]')
        || document.querySelector('button[data-testid="fruitjuice-send-button"]')
        || [...document.querySelectorAll('button')].find(b => {
          const label = (b.getAttribute('aria-label') || '') + (b.innerText || '');
          return /send|submit|gửi/i.test(label) && !b.disabled;
        });
      if (!btn || btn.disabled) return { ok:false, error:'no_send_button' };
      btn.click();
      return { ok:true };
    })()`)

    if (!submitted?.ok) {
      // fallback: Enter key
      await evalJs(`(() => {
        const box = document.querySelector('#prompt-textarea') || document.querySelector('div[contenteditable="true"]');
        if (!box) return false;
        box.focus();
        box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        return true;
      })()`)
    }

    await report(50, 'Waiting for ChatGPT reply…')
    const pollMs = input.pollMs ?? 3000
    const rounds = input.pollRounds ?? 40
    let replyText = ''
    let imageUrls: string[] = []
    let textSample = ''

    for (let i = 0; i < rounds; i++) {
      await sleep(pollMs)
      const poll = await evalJs(`(() => {
        const articles = [...document.querySelectorAll('[data-message-author-role="assistant"], .agent-turn, [data-testid*="conversation-turn"]')];
        let last = '';
        for (let i = articles.length - 1; i >= 0; i--) {
          const t = (articles[i].innerText || '').trim();
          if (t.length > 20) { last = t; break; }
        }
        if (!last) {
          const msgs = [...document.querySelectorAll('div[data-message-id]')];
          for (let i = msgs.length - 1; i >= 0; i--) {
            const role = msgs[i].getAttribute('data-message-author-role') || '';
            if (role === 'assistant') {
              last = (msgs[i].innerText || '').trim();
              break;
            }
          }
        }
        const imgs = [...document.querySelectorAll('img')].map(img => img.src || '').filter(s =>
          /^https?:/i.test(s) && !/avatar|icon|emoji|logo|spinner/i.test(s) && s.length > 40
        );
        const streaming = !!document.querySelector('[data-testid="stop-button"], button[aria-label*="Stop"]');
        return {
          reply: last.slice(0, 8000),
          images: [...new Set(imgs)].slice(0, 8),
          streaming,
          url: location.href,
          body: (document.body?.innerText || '').slice(0, 300),
        };
      })()`)

      replyText = String(poll?.reply || '')
      imageUrls = Array.isArray(poll?.images) ? poll.images.map(String) : []
      textSample = String(poll?.body || '').slice(0, 300)
      const pct = Math.min(90, 50 + Math.round((i / rounds) * 40))
      await report(pct, poll?.streaming ? 'ChatGPT generating…' : 'Reading reply…')

      if (!poll?.streaming && (replyText.length > 40 || imageUrls.length > 0) && i > 1)
        break
    }

    const tabUrl = String(await evalJs('location.href') || '')
    const hasContent = replyText.length > 20 || imageUrls.length > 0
    return {
      ok: hasContent,
      phase: hasContent
        ? (imageUrls.length ? 'images_ready' : 'reply_ready')
        : 'submitted_no_reply',
      promptSubmitted: true,
      replyText: replyText || undefined,
      imageUrls: imageUrls.length ? imageUrls : undefined,
      tabUrl,
      textSample,
      error: hasContent ? undefined : 'no_assistant_reply_in_poll_window',
    }
  }
  catch (e) {
    return {
      ok: false,
      phase: 'cdp_error',
      error: e instanceof Error ? e.message : String(e),
    }
  }
  finally {
    await session.close()
  }
}
