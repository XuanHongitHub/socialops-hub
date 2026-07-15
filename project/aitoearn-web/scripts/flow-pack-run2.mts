async function main() {
  const prompt = '10s vertical product commercial terracotta cone tee soft studio light photoreal 9:16'
  const list = await (await fetch('http://127.0.0.1:9480/json/list')).json()
  const project = list.find((t: any) => t.type==='page' && String(t.url||'').includes('/project/'))
  const panel = list.find((t: any) => t.type==='page' && String(t.url||'').includes('fnmijgmnjpealnnadjpjilaanhhambeb'))
  console.log('project', project?.url, 'panel', !!panel)
  if (!panel || !project) throw new Error('missing tabs')

  // activate project
  const ver = await (await fetch('http://127.0.0.1:9480/json/version')).json()
  const bws = new WebSocket(ver.webSocketDebuggerUrl)
  await new Promise<void>((res,rej)=>{bws.onopen=()=>res();bws.onerror=()=>rej();setTimeout(()=>rej(new Error('to')),5000)})
  let bid=1; const bp=new Map()
  bws.onmessage=(ev)=>{const m=JSON.parse(String(ev.data)); if(m.id!=null&&bp.has(m.id)){bp.get(m.id)(m);bp.delete(m.id)}}
  const bsend=(method:string,params:any={})=>new Promise((resolve,reject)=>{const i=bid++;bp.set(i,resolve);bws.send(JSON.stringify({id:i,method,params}));setTimeout(()=>reject(new Error('t')),10000)})
  await bsend('Target.activateTarget',{targetId: project.id})
  bws.close()
  await new Promise(r=>setTimeout(r,1000))

  const ws = new WebSocket(panel.webSocketDebuggerUrl)
  await new Promise<void>((res,rej)=>{ws.onopen=()=>res();ws.onerror=()=>rej();setTimeout(()=>rej(new Error('to')),5000)})
  let id=1; const pending=new Map()
  ws.onmessage=(ev)=>{const m=JSON.parse(String(ev.data)); if(m.id!=null&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}}
  const send=(method:string,params:any={})=>new Promise<any>((resolve,reject)=>{const i=id++;pending.set(i,resolve);ws.send(JSON.stringify({id:i,method,params}));setTimeout(()=>reject(new Error('t')),20000)})
  const val=(r:any)=>r?.result?.result?.value ?? r?.result?.value
  await send('Runtime.enable')
  await send('Page.reload',{})
  await new Promise(r=>setTimeout(r,3000))

  // dismiss modals
  await send('Runtime.evaluate',{expression:`([...document.querySelectorAll('button')].filter(b=>/I understand/i.test(b.innerText||''))).forEach(b=>b.click())`,returnByValue:true})

  const run = await send('Runtime.evaluate', {
    expression: `(() => {
      const prompt = ${JSON.stringify(prompt)};
      [...document.querySelectorAll('button')].find(b=>/Text to Video/i.test(b.innerText||''))?.click();
      const tas = [...document.querySelectorAll('textarea')];
      // pick the big prompts textarea (placeholder with Example)
      const ta = tas.find(t => /Example|prompt|blank line/i.test(t.placeholder||'')) || tas[tas.length-1];
      if (!ta) return {ok:false, error:'no ta', count: tas.length};
      const proto = window.HTMLTextAreaElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      desc?.set?.call(ta, prompt);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
      // also try vue input
      ta.dispatchEvent(new InputEvent('input', { bubbles: true, data: prompt, inputType: 'insertText' }));
      // wait microtask then run
      const runBtn = [...document.querySelectorAll('button')].find(b => /^Run$/i.test((b.innerText||'').trim()));
      if (!runBtn) return {ok:false, error:'no run', value: ta.value?.slice(0,40)};
      runBtn.click();
      return {ok:true, valueLen: (ta.value||'').length, value: (ta.value||'').slice(0,50)};
    })()`,
    returnByValue: true,
  })
  console.log('RUN', val(run))
  await new Promise(r=>setTimeout(r,2000))
  for (let i=0;i<6;i++) {
    await new Promise(r=>setTimeout(r,4000))
    const st = val(await send('Runtime.evaluate',{
      expression: `JSON.stringify({
        q: (document.body?.innerText||'').match(/PROMPT QUEUE[\\s\\S]{0,120}/)?.[0],
        body: (document.body?.innerText||'').slice(0,300)
      })`,
      returnByValue:true
    }))
    console.log('P',i,st)
  }
  ws.close()
}
main().catch(e=>{console.error(e);process.exit(1)})
