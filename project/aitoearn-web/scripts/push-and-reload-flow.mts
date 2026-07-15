import { pushHubDefaultsToAllSeats, resolvePushSeats } from '../src/app/api/ai/providers/extension/extensionSettingsPush.ts'
import { CdpSession, getBrowserWsUrl, listCdpTargets } from '../src/app/api/ai/providers/workspace/cdpClient.ts'

async function reloadFlowPack(cdp: string) {
  const targets = await listCdpTargets(cdp)
  const sw = targets.find(t => (t.type === 'service_worker' || t.url?.includes('service_worker')) && String(t.url||'').includes('fnmijgmnjpealnnadjpjilaanhhambeb'))
  const page = targets.find(t => t.type === 'page' && String(t.url||'').includes('fnmijgmnjpealnnadjpjilaanhhambeb'))
  const target = sw || page
  if (!target?.id) return { ok: false, reason: 'no_target' }
  const ws = await getBrowserWsUrl(cdp)
  const session = new CdpSession(ws)
  try {
    await session.connect()
    const sid = await session.attachPage(target.id)
    await session.send('Runtime.enable', {}, sid)
    const r = await session.send('Runtime.evaluate', {
      expression: `(() => { try { chrome.runtime.reload(); return { ok: true } } catch(e) { return { ok: false, error: String(e) } } })()`,
      awaitPromise: true,
      returnByValue: true,
    }, sid)
    return { ok: true, r }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  } finally {
    await session.close()
  }
}

const push = await pushHubDefaultsToAllSeats({ packIds: ['flow-automation'], closeSidePanels: true })
console.log('push', JSON.stringify(push.summary), push.pushedPackIds)

const seats = await resolvePushSeats()
for (const s of seats) {
  const r = await reloadFlowPack(s.cdpEndpoint)
  console.log('reload', s.seatId, r)
}
