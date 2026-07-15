import { pushHubDefaultsToAllSeats, resolvePushSeats } from '../src/app/api/ai/providers/extension/extensionSettingsPush.ts'

async function main() {
  const seats = await resolvePushSeats()
  console.log('seats', JSON.stringify(seats, null, 2))
  const r = await pushHubDefaultsToAllSeats()
  console.log(JSON.stringify(r, null, 2))
}
main().catch((e) => { console.error(e); process.exit(1) })
