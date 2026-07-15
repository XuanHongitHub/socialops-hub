import { apiOk } from '../../_local'
import { discoverGrokModels } from '../_client'
export async function GET() {
  try { return apiOk(await discoverGrokModels(), '/api/ai/providers/grok/models') }
  catch (error) { return Response.json({ code: 503, data: [], message: error instanceof Error ? error.message : String(error), url: '/api/ai/providers/grok/models' }, { status: 503 }) }
}
