const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const PORT = 51984;
const OUT = 'F:/Herd/AiToEarn/.social-asets/bugsell-demo-video.mp4';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function targets(){ return await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); }
async function newTab(url){ return await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, {method:'PUT'})).json(); }
async function closeTabs(){ for(const t of (await targets()).filter(t=>t.type==='page'&&(t.url.includes('socialops.bebio.site')||t.url.includes('tiktok.com/v2/auth')||t.title.includes('TikTok connected')))){ try{ await fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`) }catch{} } }
async function conn(wsUrl){ const ws=new WebSocket(wsUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j}); let id=0,p=new Map(); ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&p.has(m.id)){const x=p.get(m.id); p.delete(m.id); m.error?x.j(new Error(JSON.stringify(m.error))):x.r(m.result)}}; return {send:(method,params={})=>{const mid=++id; ws.send(JSON.stringify({id:mid,method,params})); return new Promise((r,j)=>p.set(mid,{r,j}))}, close:()=>ws.close()}; }
function ps(script){ return execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',script],{encoding:'utf8'}); }
function move(x,y){ ps(`Add-Type -AssemblyName System.Windows.Forms; Add-Type @"\nusing System; using System.Runtime.InteropServices; public class M { [DllImport(\"user32.dll\")] public static extern bool SetCursorPos(int X,int Y); }\n"@; $p=[System.Windows.Forms.Cursor]::Position; $sx=$p.X; $sy=$p.Y; $ex=${Math.round(x)}; $ey=${Math.round(y)}; for($i=1;$i -le 28;$i++){ [M]::SetCursorPos([int]($sx+($ex-$sx)*$i/28),[int]($sy+($ey-$sy)*$i/28)); Start-Sleep -Milliseconds 14 }`); }
async function bring(tab){ const c=await conn(tab.webSocketDebuggerUrl); await c.send('Page.enable'); await c.send('Runtime.enable'); await c.send('Page.bringToFront'); return c; }
function bugTitle(){ return ps(`Add-Type @"\nusing System;using System.Text;using System.Runtime.InteropServices;public class W{public delegate bool E(IntPtr h,IntPtr l);[DllImport(\"user32.dll\")]public static extern bool EnumWindows(E e,IntPtr l);[DllImport(\"user32.dll\")]public static extern int GetWindowText(IntPtr h,StringBuilder s,int c);[DllImport(\"user32.dll\")]public static extern bool IsWindowVisible(IntPtr h);[DllImport(\"user32.dll\")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);[DllImport(\"user32.dll\")]public static extern bool ShowWindow(IntPtr h,int n);[DllImport(\"user32.dll\")]public static extern bool SetForegroundWindow(IntPtr h);}\n"@; $title=''; [W]::EnumWindows({param($h,$l) if([W]::IsWindowVisible($h)){ $procId=0; [void][W]::GetWindowThreadProcessId($h,[ref]$procId); $p=Get-Process -Id $procId -ErrorAction SilentlyContinue; if($p.Path -like '*BugLogin*binaries*' -and ($p.ProcessName -like '*chrome*' -or $p.ProcessName -like '*buglogin*')){ $sb=New-Object Text.StringBuilder 512; [void][W]::GetWindowText($h,$sb,512); if($sb.ToString()){ [W]::ShowWindow($h,3)|Out-Null; [W]::SetForegroundWindow($h)|Out-Null; $script:title=$sb.ToString(); return $false } } }; $true },[IntPtr]::Zero)|Out-Null; $title`).trim(); }
async function waitPage(pred, ms=50000){ const end=Date.now()+ms; while(Date.now()<end){ const t=(await targets()).find(x=>x.type==='page'&&pred(x)); if(t) return t; await sleep(1000);} return null; }
async function draftUpload(){ const acc=await (await fetch('https://socialops.bebio.site/api/v2/channels/accounts')).json(); const tt=acc.data.list.find(a=>a.type==='tiktok'); if(!tt) throw new Error('No TikTok account'); const body={accountId:tt.id,accountType:'tiktok',uid:tt.uid,type:'video',title:'BugSell SocialOps Hub demo',desc:'TikTok draft upload demo for BugSell SocialOps Hub.',videoUrl:'https://socialops.bebio.site/demo/bugsell-tiktok-smoke.mp4',option:{}}; const res=await fetch('https://socialops.bebio.site/api/plat/publish/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); const data=await res.json(); if(data.code!==0) throw new Error(data.message||'draft failed'); return data.data.flowId; }
(async()=>{
 fs.mkdirSync(path.dirname(OUT),{recursive:true}); try{fs.unlinkSync(OUT)}catch{}
 await closeTabs();
 const hub=await newTab('https://socialops.bebio.site/en/accounts'); const hubC=await bring(hub); await sleep(7000); move(570,185); await sleep(1200);
 const title=bugTitle(); console.log('title', title); if(!title) throw new Error('no window title');
 const ff=spawn('ffmpeg',['-y','-f','gdigrab','-framerate','30','-draw_mouse','1','-i',`title=${title}`,'-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p',OUT],{stdio:['pipe','ignore','ignore']});
 try {
  await sleep(1800);
  const auth=await (await fetch('https://socialops.bebio.site/api/plat/tiktok/auth/url',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({spaceId:'default'})})).json();
  const authTab=await newTab(auth.data.url); const authC=await bring(authTab); await sleep(9000); move(960,520); authC.close();
  const cb=await waitPage(t=>t.title.includes('TikTok connected')||t.url.includes('/auth/tiktok/callback'),50000); if(!cb) throw new Error('no callback'); const cbC=await bring(cb); await sleep(6000); cbC.close();
  await hubC.send('Page.bringToFront'); await hubC.send('Page.navigate',{url:'https://socialops.bebio.site/en/accounts'}); await sleep(6500); move(75,862); await sleep(2500);
  const flowId=await draftUpload();
  await hubC.send('Page.navigate',{url:'https://socialops.bebio.site/en/accounts'}); await sleep(6000); move(1320,412); await sleep(3500);
  const rec=await newTab(`https://socialops.bebio.site/api/plat/publish/records/${flowId}`); const recC=await bring(rec); await sleep(4500); recC.close();
 } finally { try{ff.stdin.write('q')}catch{}; await new Promise(r=>ff.on('close',r)); hubC.close(); }
 console.log(OUT);
})();
