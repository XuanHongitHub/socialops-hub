async function main() {
  const prompt = `A 10-second vertical fashion commercial for Terracotta Cartoon Cone Crosswalk Graphic T-Shirt. Soft studio light, photoreal UGC, product print locked, 9:16.`
  const list0 = await (await fetch('http://127.0.0.1:9480/json/list')).json()
  // Focus project page
  let project = list0.find((t: any) => t.type==='page' && String(t.url||'').includes('/project/'))
  if (!project) {
    // navigate existing flow tab
    const flow = list0.find((t: any) => t.type==='page' && String(t.url||'').includes('labs.google'))
    if (flow) {
      const ws0 = new WebSocket(flow.webSocketDebuggerUrl)
      await new Promise<void>((res,rej)=>{ws0.onopen=()=>res();ws0.onerror=()=>rej(new Error('ws'));setTimeout(()=>rej(new Error('to')),5000)})
      // skip - create project already exists
      ws0.close()
    }
  }
  const list = await (await fetch('http://127.0.0.1:9480/json/list')).json()
  project = list.find((t: any) => t.type==='page' && String(t.url||'').includes('/project/'))
  console.log('project', project?.url)

  const extId = 'fnmijgmnjpealnnadjpjilaanhhambeb'
  let panel = list.find((t: any) => t.type==='page' && String(t.url||'').includes(extId))
  if (!panel) {
    await fetch(`http://127.0.0.1:9480/json/new?${encodeURIComponent('chrome-extension://'+extId+'/src/ui/side-panel/index.html')}`, { method: 'PUT' })
    await new Promise(r => setTimeout(r, 2500))
    const list2 = await (await fetch('http://127.0.0.1:9480/json/list')).json()
    panel = list2.find((t: any) => t.type==='page' && String(t.url||'').includes(extId))
  }
  if (!panel) throw new Error('no panel')

  // Activate project tab first so pack detects Flow project page
  if (project?.id) {
    // Bring project to front via Target.activateTarget on browser
    const ver = await (await fetch('http://127.0.0.1:9480/json/version')).json()
    const bws = new WebSocket(ver.webSocketDebuggerUrl)
    await new Promise<void>((res,rej)=>{bws.onopen=()=>res();bws.onerror=()=>rej(new Error('bws'));setTimeout(()=>rej(new Error('to')),5000)})
    let id=1
    const pending=new Map()
    bws.onmessage=(ev)=>{const m=JSON.parse(String(ev.data)); if(m.id!=null&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}}
    const send=(method:string,params:any={})=>new Promise((resolve,reject)=>{const i=id++;pending.set(i,resolve);bws.send(JSON.stringify({id:i,method,params}));setTimeout(()=>reject(new Error('t '+method)),10000)})
    await send('Target.activateTarget', { targetId: project.id })
    bws.close()
    await new Promise(r => setTimeout(r, 1500))
  }

  // Re-open panel if needed after activate
  const list3 = await (await fetch('http://127.0.0.1:9480/json/list')).json()
  panel = list3.find((t: any) => t.type==='page' && String(t.url||'').includes(extId)) || panel

  const ws = new WebSocket(panel.webSocketDebuggerUrl)
  await new Promise<void>((res,rej)=>{ws.onopen=()=>res();ws.onerror=()=>rej(new Error('ws'));setTimeout(()=>rej(new Error('to')),8000)})
  let id=1
  const pending=new Map<number,(v:any)=>void>()
  ws.onmessage=(ev)=>{const m=JSON.parse(String(ev.data)); if(m.id!=null&&pending.has(m.id)){pending.get(m.id)!(m);pending.delete(m.id)}}
  const send=(method:string,params:any={})=>new Promise<any>((resolve,reject)=>{const i=id++;pending.set(i,resolve);ws.send(JSON.stringify({id:i,method,params}));setTimeout(()=>reject(new Error('t '+method)),20000)})
  const val=(r:any)=>r?.result?.result?.value ?? r?.result?.value
  await send('Runtime.enable')
  await new Promise(r => setTimeout(r, 1500))

  // If still "Not on Flow Project", click Navigate to Flow then re-check
  let text = val(await send('Runtime.evaluate',{expression:`document.body?.innerText||''`,returnByValue:true}))
  console.log('panel_head', String(text).slice(0,120))
  if (/Not on a Flow Project/i.test(String(text))) {
    await send('Runtime.evaluate',{expression:`([...document.querySelectorAll('button')].find(b=>/Navigate to Flow/i.test(b.innerText||''))||{click:()=>{}}).click()`,returnByValue:true})
    await new Promise(r => setTimeout(r, 4000))
    // re-activate project
    const list4 = await (await fetch('http://127.0.0.1:9480/json/list')).json()
    project = list4.find((t: any) => t.type==='page' && String(t.url||'').includes('/project/'))
    console.log('project after nav', project?.url)
  }

  // Reload panel to re-detect page
  await send('Page.reload', {}).catch(()=>null)
  await new Promise(r => setTimeout(r, 2500))
  text = val(await send('Runtime.evaluate',{expression:`document.body?.innerText||''`,returnByValue:true}))
  console.log('panel_head2', String(text).slice(0,150))

  // Select Text to Video, set prompt, outputs 1, Run
  const run = await send('Runtime.evaluate', {
    expression: `(() => {
      const prompt = ${JSON.stringify(prompt)};
      // mode
      const modes = [...document.querySelectorAll('button')]
      const t2v = modes.find(b => /Text to Video/i.test(b.innerText||''))
      if (t2v) t2v.click()
      // prompts textarea
      const ta = document.querySelector('textarea')
      if (!ta) return { ok:false, error:'no_textarea', text:(document.body?.innerText||'').slice(0,200) }
      ta.focus()
      ta.value = prompt
      ta.dispatchEvent(new Event('input', { bubbles:true }))
      ta.dispatchEvent(new Event('change', { bubbles:true }))
      // outputs = 1 already
      // Run
      const runBtn = [...document.querySelectorAll('button')].find(b => /^Run$/i.test((b.innerText||'').trim()))
      if (!runBtn) return { ok:false, error:'no_run', promptLen: ta.value.length }
      runBtn.click()
      return { ok:true, promptLen: ta.value.length, mode: t2v ? 'textToVideo' : 'unknown' }
    })()`,
    returnByValue: true,
  })
  console.log('RUN', val(run))

  // Poll panel status
  for (let i=0;i<24;i++) {
    await new Promise(r => setTimeout(r, 5000))
    const st = val(await send('Runtime.evaluate', {
      expression: `JSON.stringify({
        text: (document.body?.innerText||'').slice(0,500),
        queue: (document.body?.innerText||'').match(/PROMPT QUEUE[\\s\\S]{0,80}/)?.[0] || null,
        active: /active/i.test(document.body?.innerText||'')
      })`,
      returnByValue: true,
    }))
    console.log('P', i, st)
    try {
      const p = JSON.parse(st)
      if (/completed|done|success|downloaded|finished/i.test(p.text) && i > 2) break
      if (/error|failed|unusual/i.test(p.text) && /PROMPT QUEUE/.test(p.text)) { /* continue */ }
    } catch {}
  }

  // Check project page for videos
  const list5 = await (await fetch('http://127.0.0.1:9480/json/list')).json()
  project = list5.find((t: any) => t.type==='page' && String(t.url||'').includes('/project/'))
  if (project) {
    const pws = new WebSocket(project.webSocketDebuggerUrl)
    await new Promise<void>((res,rej)=>{pws.onopen=()=>res();pws.onerror=()=>rej(new Error('pws'));setTimeout(()=>rej(new Error('to')),5000)})
    let pid=1
    const pp=new Map()
    pws.onmessage=(ev)=>{const m=JSON.parse(String(ev.data)); if(m.id!=null&&pp.has(m.id)){pp.get(m.id)(m);pp.delete(m.id)}}
    const psend=(method:string,params:any={})=>new Promise((resolve,reject)=>{const i=pid++;pp.set(i,resolve);pws.send(JSON.stringify({id:i,method,params}));setTimeout(()=>reject(new Error('t')),15000)})
    await psend('Runtime.enable')
    const snap = await psend('Runtime.evaluate',{expression:`JSON.stringify({url:location.href,tiles:document.querySelectorAll('[data-tile-id]').length,videos:document.querySelectorAll('video').length,text:(document.body?.innerText||'').slice(0,400)})`,returnByValue:true})
    console.log('PROJECT_SNAP', (snap as any)?.result?.result?.value ?? (snap as any)?.result?.value ?? snap)
    pws.close()
  }
  ws.close()
}
main().catch(e => { console.error(e); process.exit(1) })
