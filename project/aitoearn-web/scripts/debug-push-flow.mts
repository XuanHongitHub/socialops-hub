import { pushStorageToExtensionOnCdp, resolvePushSeats, buildPackStoragePatches, PACK_STORAGE_TARGETS } from '../src/app/api/ai/providers/extension/extensionSettingsPush.ts'
import { FLOW_VEO_DEFAULTS } from '../src/app/api/ai/providers/extension/flowVeoDefaults.ts'
import { listCdpTargets } from '../src/app/api/ai/providers/workspace/cdpClient.ts'

const seats = await resolvePushSeats()
console.log('seats', seats)
const patches = buildPackStoragePatches({ flowVeo: FLOW_VEO_DEFAULTS })
console.log('flowPatch', patches['flow-automation'])
const t = PACK_STORAGE_TARGETS.find(p => p.packId === 'flow-automation')!

for (const s of seats) {
  const targets = await listCdpTargets(s.cdpEndpoint)
  const ext = targets.filter(x => String(x.url||'').includes('fnmij') || String(x.url||'').includes('chrome-extension'))
  console.log(s.seatId, 'targets', targets.map(x => `${x.type}:${(x.url||'').slice(0,70)}`).slice(0,8))
  const r = await pushStorageToExtensionOnCdp({
    cdpEndpoint: s.cdpEndpoint,
    extensionId: t.extensionId,
    storageKey: t.storageKey,
    patch: patches['flow-automation'],
    sidePanelPath: t.sidePanelPath,
  })
  console.log(s.seatId, r)
}
