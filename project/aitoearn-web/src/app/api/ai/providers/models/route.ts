import { apiOk, discover9RouterModels } from '../_local'

export async function GET() {
  try {
    return apiOk(await discover9RouterModels(), '/api/ai/providers/models')
  }
  catch (error) {
    return Response.json({ code: 503, data: [], message: error instanceof Error ? error.message : String(error), url: '/api/ai/providers/models' }, { status: 503 })
  }
}
