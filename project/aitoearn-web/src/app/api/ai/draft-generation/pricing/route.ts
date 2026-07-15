import { getDraftPricing } from '../_local'
export async function GET() { return Response.json({ code: 0, data: await getDraftPricing(), message: 'ok', url: '/api/ai/draft-generation/pricing' }) }
