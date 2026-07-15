import { pushHubDefaultsToAllSeats, resolvePushSeats } from '../src/app/api/ai/providers/extension/extensionSettingsPush.ts'
import { CdpSession, getBrowserWsUrl, listCdpTargets } from '../src/app/api/ai/providers/workspace/cdpClient.ts'
import { FLOW_VEO_DEFAULTS } from '../src/app/api/ai/providers/extension/flowVeoDefaults.ts'

console.log('defaults', FLOW_VEO_DEFAULTS)

const push = await pushHubDefaultsToAllSeats({
  flowVeo: FLOW_VEO_DEFAULTS,
  packIds: ['flow-automation'],
  closeSidePanels: true,
})
console.log('push', push.summary, push.seats.map(s => ({
  id: s.seatId,
  packs: s.packs.map(p => ({ ok: p.ok, out: p.outputCount, err: p.error })),
})))

// reload pack so side panel picks storage
async function reload(cdp: string) {
  const targets = await listCdpTargets(cdp)
  const t = targets.find(x => String(x.url||'').includes('fnmijgmnjpealnnadjpjilaanhhambeb'))
  if (!t?.id) return 'no_target'
  const session = new CdpSession(await getBrowserWsUrl(cdp))
  try {
    await session.connect()
    const sid = await session.attachPage(t.id)
    await session.send('Runtime.enable', {}, sid)
    await session.send('Runtime.evaluate', {
      expression: `chrome.runtime.reload()`,
      returnByValue: true,
    }, sid).catch(() => null)
    return 'reloaded'
  } catch (e) {
    return String(e)
  } finally {
    await session.close()
  }
}
for (const s of await resolvePushSeats()) {
  console.log(s.seatId, await reload(s.cdpEndpoint))
}
