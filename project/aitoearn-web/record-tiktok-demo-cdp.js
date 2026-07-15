const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const PORT = 51984;
const BASE = 'https://socialops.bebio.site';
const OUT = 'F:/Herd/AiToEarn/.social-asets/bugsell-demo-video.mp4';
const FRAMES = 'F:/Herd/AiToEarn/.social-asets/cdp-frames';
const FPS = 8;
const W = 1440, H = 900;
let frame = 0;
let current = null;
let cursor = { x: 720, y: 450 };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function targets(){ return await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); }
async function newTab(url){ return await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, {method:'PUT'})).json(); }
async function closeMatching(){ for(const t of (await targets()).filter(t=>t.type==='page'&&(t.url.includes('socialops.bebio.site')||t.url.includes('tiktok.com')))){ try{ await fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`) }catch{} } }
async function conn(wsUrl){
  const wsPath = 'F:/Herd/AiToEarn/project/aitoearn-web/node_modules/next/dist/compiled/ws';
  const ws = new (require(wsPath))(wsUrl);
  await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
  let id=0,p=new Map();
  ws.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.id&&p.has(m.id)){
      const x=p.get(m.id);
      p.delete(m.id);
      m.error?x.j(new Error(JSON.stringify(m.error))):x.r(m.result)
    }
  };
  return {
    send:(method,params={})=>{
      const mid=++id;
      ws.send(JSON.stringify({id:mid,method,params}));
      return new Promise((r,j)=>p.set(mid,{r,j}))
    },
    close:()=>ws.close()
  };
}
async function setCurrent(tab){ if(current?.c) current.c.close(); const c=await conn(tab.webSocketDebuggerUrl); await c.send('Page.enable'); await c.send('Runtime.enable'); await c.send('Page.bringToFront'); await c.send('Emulation.setDeviceMetricsOverride',{width:W,height:H,deviceScaleFactor:1,mobile:false}); current={tab,c}; await sleep(600); }
async function evalJs(js){ return (await current.c.send('Runtime.evaluate',{expression:js,returnByValue:true,awaitPromise:true})).result.value; }
async function shot(){ if(!current) return; let s; for(let i=0;i<5;i++){ try{ s=await current.c.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}); break; }catch(e){ await sleep(300); } } if(!s) return; const input=Buffer.from(s.data,'base64'); const svg=`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><path d="M ${cursor.x} ${cursor.y} l 0 24 l 6 -6 l 5 12 l 5 -2 l -5 -12 l 9 0 z" fill="white" stroke="black" stroke-width="1.5"/></svg>`; const out=path.join(FRAMES,`frame-${String(frame++).padStart(5,'0')}.png`); await sharp(input).resize(W,H,{fit:'cover'}).composite([{input:Buffer.from(svg),top:0,left:0}]).png().toFile(out); }
async function hold(ms){ const n=Math.ceil(ms/(1000/FPS)); for(let i=0;i<n;i++){ await shot(); await sleep(1000/FPS); } }
async function pointText(text){ return await evalJs(`(() => { const re=new RegExp(${JSON.stringify(text)},'i'); const els=[...document.querySelectorAll('button,a,[role="button"],input')]; const e=els.find(e=>re.test((e.innerText||e.value||e.getAttribute('aria-label')||e.title||'').trim())); if(!e) return null; e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,text:(e.innerText||e.value||e.title||'').trim()}; })()`); }
async function clickText(text){ const p=await pointText(text); if(!p) throw new Error('missing text '+text); cursor={x:p.x,y:p.y}; await hold(500); await current.c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y}); await current.c.send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1}); await current.c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1}); await hold(1200); }
async function draftUpload(){ const acc=await (await fetch(`${BASE}/api/v2/channels/accounts`)).json(); const tt=acc.data.list.find(a=>a.type==='tiktok'); if(!tt) throw new Error('No TikTok account after OAuth'); const body={accountId:tt.id,accountType:'tiktok',uid:tt.uid,type:'video',title:'BugSell SocialOps Hub TikTok demo',desc:'TikTok draft upload demo for BugSell SocialOps Hub.',videoUrl:`${BASE}/demo/bugsell-tiktok-smoke.mp4`,option:{}}; const res=await fetch(`${BASE}/api/plat/publish/create`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); const data=await res.json(); if(data.code!==0) throw new Error(data.message||'draft failed'); return data.data.flowId; }
function resetLocal(){ console.warn('resetLocal disabled: never mutate SocialsHub channel store during recording.'); }
(async()=>{
 fs.rmSync(FRAMES,{recursive:true,force:true}); fs.mkdirSync(FRAMES,{recursive:true}); fs.rmSync(OUT,{force:true}); await closeMatching();
 const hub=await newTab(`${BASE}/en/accounts`); await setCurrent(hub); await hold(4500);
 await clickText('Add Channels'); await clickText('TikTok');
 let auth=null; for(let i=0;i<45;i++){ const list=await targets(); auth=list.find(t=>t.type==='page'&&(t.url.includes('tiktok.com/v2/auth')||t.url.includes('/auth/tiktok/callback')||t.title.includes('TikTok connected'))); if(auth) break; await hold(1000); }
 if(!auth) throw new Error('auth page missing'); await setCurrent(auth); await hold(3500);
 if(current.tab.url.includes('tiktok.com')) { for(const label of ['Continue','Authorize','Allow']){ const p=await pointText(label); if(p){ await clickText(label); break; } } }
 let cb=null; for(let i=0;i<60;i++){ const list=await targets(); cb=list.find(t=>t.type==='page'&&(t.url.includes('/auth/tiktok/callback')||t.title.includes('TikTok connected'))); if(cb) break; await hold(1000); }
 if(!cb) throw new Error('callback missing'); await setCurrent(cb); await hold(5000);
 await current.c.send('Page.navigate',{url:`${BASE}/en/accounts`}); await hold(6500);
 await clickText('My Channels'); await hold(3500);
 const flowId=await draftUpload(); await hold(1500);
 const rec=await newTab(`${BASE}/api/plat/publish/records/${flowId}`); await setCurrent(rec); await hold(6000);
 if(current?.c) current.c.close();
 const args=['-y','-framerate',String(FPS),'-i',path.join(FRAMES,'frame-%05d.png'),'-c:v','libx264','-pix_fmt','yuv420p','-vf',`fps=30,scale=${W}:${H}`,'-movflags','+faststart',OUT];
 const r=spawnSync('ffmpeg',args,{stdio:'inherit'}); if(r.status) process.exit(r.status); console.log(OUT);
})().catch(e=>{ console.error(e.stack||e); process.exit(1); });




