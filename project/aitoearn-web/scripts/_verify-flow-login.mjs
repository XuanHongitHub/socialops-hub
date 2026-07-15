const cdp = process.env.CDP || 'http://127.0.0.1:9340';
async function main() {
  const list = await fetch(cdp + '/json/list').then(r => r.json());
  let page = list.find(t => t.type === 'page' && String(t.url||'').includes('labs.google'));
  if (!page) {
    await fetch(cdp + '/json/new?' + encodeURIComponent('https://labs.google/fx/tools/flow'), { method: 'PUT' }).catch(() => null);
    await new Promise(r => setTimeout(r, 3000));
    const list2 = await fetch(cdp + '/json/list').then(r => r.json());
    page = list2.find(t => t.type === 'page' && String(t.url||'').includes('labs.google'));
  }
  if (!page) { console.log(JSON.stringify({ ok:false, error:'no_flow_tab' })); return; }
  const ver = await fetch(cdp + '/json/version').then(r => r.json());
  const wsUrl = ver.webSocketDebuggerUrl;
  const WS = globalThis.WebSocket;
  const ws = new WS(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); setTimeout(() => rej(new Error('timeout')), 8000); });
  let id = 1; const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(msg.error) : p.res(msg.result); }
  };
  const send = (method, params, sessionId) => new Promise((res, rej) => {
    const mid = id++; pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
    setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); rej(new Error('cdp_timeout '+method)); } }, 15000);
  });
  const { sessionId } = await send('Target.attachToTarget', { targetId: page.id, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  const expr = `(() => {
    const text = (document.body?.innerText||'').slice(0,800);
    const url = location.href;
    const boxes = document.querySelectorAll('[role=textbox],textarea,[contenteditable=true]').length;
    const loginish = /sign in|log in|đăng nhập|accounts\\.google/i.test(text+url);
    const project = /\\/project\\//i.test(url);
    const create = /Create with Google Flow|Tạo với Google Flow|Create a project|Tạo một dự án|What do you want|Bạn muốn tạo/i.test(text);
    return { url, boxes, loginish, project, create, text: text.slice(0,350), title: document.title };
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
  console.log(JSON.stringify({ ok:true, pageUrl: page.url, result: r?.result?.value || r }, null, 2));
  ws.close();
}
main().catch(e => { console.error(JSON.stringify({ ok:false, error: String(e.message||e) })); process.exit(1); });
