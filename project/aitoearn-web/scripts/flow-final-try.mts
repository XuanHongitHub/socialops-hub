async function main() {
  const list = await (await fetch('http://127.0.0.1:9480/json/list')).json()
  const page = list.find((t: any) => t.type==='page' && String(t.url||'').includes('/project/'))
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise<void>((res,rej)=>{ws.onopen=()=>res();ws.onerror=()=>rej();setTimeout(()=>rej(new Error('to')),5000)})
  let id=1; const pending=new Map()
  ws.onmessage=(ev)=>{const m=JSON.parse(String(ev.data)); if(m.id!=null&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}}
  const send=(method:string,params:any={})=>new Promise<any>((resolve,reject)=>{const i=id++;pending.set(i,resolve);ws.send(JSON.stringify({id:i,method,params}));setTimeout(()=>reject(new Error('t')),20000)})
  const val=(r:any)=>r?.result?.result?.value ?? r?.result?.value
  await send('Runtime.enable')

  // Click Video filter/tab
  let r = await send('Runtime.evaluate',{expression:`(() => {
    const els=[...document.querySelectorAll('button')]
    const b=els.find(e=>/videocam/i.test(e.innerHTML||'') && /Video/i.test(e.innerText||''))
    if(b){b.click(); return 'video-tab'}
    return 'no'
  })()`,returnByValue:true})
  console.log('TAB', val(r))
  await new Promise(r=>setTimeout(r,1000))

  // Fill prompt cleanly
  const prompt = '10 second vertical UGC fashion video of terracotta cartoon cone graphic t-shirt, soft studio light, photoreal, 9:16'
  r = await send('Runtime.evaluate',{expression:`(() => {
    const prompt = ${JSON.stringify(prompt)};
    const box = document.querySelector('[role=textbox][contenteditable=true]') || document.querySelector('[role=textbox]');
    if(!box) return {ok:false};
    box.focus(); box.click();
    const sel=window.getSelection(); const range=document.createRange();
    range.selectNodeContents(box); sel.removeAllRanges(); sel.addRange(range);
    document.execCommand('delete');
    document.execCommand('insertText', false, prompt);
    box.dispatchEvent(new InputEvent('input',{bubbles:true,data:prompt,inputType:'insertText'}));
    return {ok:true, text:(box.innerText||'').slice(0,80)};
  })()`,returnByValue:true})
  console.log('FILL', val(r))
  await new Promise(r=>setTimeout(r,500))

  // Click arrow_forward Create
  r = await send('Runtime.evaluate',{expression:`(() => {
    const b=[...document.querySelectorAll('button')].find(x=>(x.innerHTML||'').includes('arrow_forward')&&!x.disabled);
    if(!b) return {ok:false};
    b.click(); return {ok:true};
  })()`,returnByValue:true})
  console.log('CREATE', val(r))

  for (let i=0;i<12;i++) {
    await new Promise(r=>setTimeout(r,8000))
    r = await send('Runtime.evaluate',{expression:`JSON.stringify({
      tiles: document.querySelectorAll('[data-tile-id]').length,
      videos: document.querySelectorAll('video').length,
      progress: !!document.querySelector('[role=progressbar], [class*=progress]'),
      agentReply: (document.body?.innerText||'').includes('Đang') || (document.body?.innerText||'').includes('Generating'),
      snippet: (document.body?.innerText||'').slice(0,350)
    })`,returnByValue:true})
    console.log('P',i,val(r))
    try {
      const p = JSON.parse(val(r))
      if (p.videos>0 || p.tiles>0) break
    } catch {}
  }
  ws.close()
}
main().catch(e=>{console.error(e);process.exit(1)})
