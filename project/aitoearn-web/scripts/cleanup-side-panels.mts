import { closeAutomationSidePanelTabs, resolvePushSeats } from '../src/app/api/ai/providers/extension/extensionSettingsPush.ts'

async function main() {
  const seats = await resolvePushSeats()
  let total = 0
  for (const s of seats) {
    const n = await closeAutomationSidePanelTabs(s.cdpEndpoint)
    console.log(s.seatId, s.cdpEndpoint, 'closed', n)
    total += n
  }
  console.log('TOTAL_CLOSED', total)
  // show remaining pages
  for (const s of seats) {
    const list = await fetch(s.cdpEndpoint + '/json/list').then(r => r.json())
    const pages = list.filter((t: any) => t.type === 'page').map((t: any) => (t.url || '').slice(0, 90))
    console.log(s.seatId, pages)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
