async function main() {
  const list = await (await fetch('http://127.0.0.1:9480/json/list')).json()
  const page = list.find((t: any) => t.type==='page' && String(t.url||'').includes('/project/'))
  if (!page) throw new Error('no project')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise<void>((res,rej)=>{ws.onopen=()=>res();ws.onerror=()=>rej();setTimeout(()=>rej(new Error('to')),5000)})
  let id=1; const pending=new Map()
  ws.onmessage=(ev)=>{const m=JSON.parse(String(ev.data)); if(m.id!=null&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}}
  const send=(method:string,params:any={})=>new Promise<any>((resolve,reject)=>{const i=id++;pending.set(i,resolve);ws.send(JSON.stringify({id:i,method,params}));setTimeout(()=>reject(new Error('t')),20000)})
  const val=(r:any)=>r?.result?.result?.value ?? r?.result?.value
  await send('Runtime.enable')

  // Click add_2 Create (not agent arrow)
  let r = await send('Runtime.evaluate',{expression:`(() => {
    const btns=[...document.querySelectorAll('button')]
    const b=btns.find(x=>(x.innerHTML||'').includes('add_2') && /Tạo|Create/i.test(x.innerText||''))
    if(!b) return JSON.stringify({ok:false, all: btns.map(x=>(x.innerText||'').trim().slice(0,30)).filter(Boolean).slice(0,20)})
    b.click(); return JSON.stringify({ok:true,t:b.innerText})
  })()`,returnByValue:true})
  console.log('ADD', val(r))
  await new Promise(r=>setTimeout(r,2000))
  r = await send('Runtime.evaluate',{expression:`JSON.stringify({
    text:(document.body?.innerText||'').slice(0,800),
    buttons:[...document.querySelectorAll('button,[role=menuitem],div[role=option]')].map(b=>(b.innerText||'').trim().replace(/\\s+/g,' ')).filter(t=>t&&t.length<60).slice(0,40),
    dialogs: document.querySelectorAll('[role=dialog],[role=menu]').length
  })`,returnByValue:true})
  console.log('MENU', val(r))

  // Try click Text to video / video option in menu
  r = await send('Runtime.evaluate',{expression:`(() => {
    const els=[...document.querySelectorAll('button,[role=menuitem],div[role=option],div[role=button],a')]
    const b=els.find(e=>/Text to [Vv]ideo|Văn bản thành video|Tạo video|Video|Frames to Video|Image to Video/i.test((e.innerText||'').trim()))
    if(!b) return JSON.stringify({ok:false})
    b.click(); return JSON.stringify({ok:true,t:(e.innerText||b.innerText||'').slice(0,40)})
  })()`,returnByValue:true})
  console.log('VIDEO_MODE', val(r))
  await new Promise(r=>setTimeout(r,2000))
  r = await send('Runtime.evaluate',{expression:`JSON.stringify({
    url:location.href,
    text:(document.body?.innerText||'').slice(0,600),
    boxes:document.querySelectorAll('[role=textbox],textarea').length,
    files:document.querySelectorAll('input[type=file]').length,
    buttons:[...document.querySelectorAll('button')].map(b=>(b.innerText||'').trim().replace(/\\s+/g,' ')).filter(Boolean).slice(0,25)
  })`,returnByValue:true})
  console.log('AFTER', val(r))
  ws.close()
}
main().catch(e=>{console.error(e);process.exit(1)})
