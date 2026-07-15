import { resolvePushSeats } from '../src/app/api/ai/providers/extension/extensionSettingsPush.ts'
import { CdpSession, getBrowserWsUrl, listCdpTargets } from '../src/app/api/ai/providers/workspace/cdpClient.ts'

async function reloadFlowPack(cdp: string) {
  const targets = await listCdpTargets(cdp)
  const target = targets.find(t => String(t.url||'').includes('fnmijgmnjpealnnadjpjilaanhhambeb'))
  if (!target?.id) return { ok: false, reason: 'no_target' }
  const session = new CdpSession(await getBrowserWsUrl(cdp))
  try {
    await session.connect()
    const sid = await session.attachPage(target.id)
    await session.send('Runtime.enable', {}, sid)
    await session.send('Runtime.evaluate', {
      expression: `(() => { try { chrome.runtime.reload(); return true } catch(e) { return String(e) } })()`,
      returnByValue: true,
    }, sid)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  } finally {
    await session.close()
  }
}

for (const s of await resolvePushSeats()) {
  console.log(s.seatId, await reloadFlowPack(s.cdpEndpoint))
}
