import { apiOk } from '@/app/api/ai/providers/_local'

export async function POST() {
  return apiOk({ ok: false, error: 'Local screenshot capture needs a CDP bridge process.' }, '/api/ai/providers/cdp/screenshot')
}
