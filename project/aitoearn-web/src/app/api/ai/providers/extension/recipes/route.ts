import { randomUUID } from 'node:crypto'
import { apiOk, readBody } from '@/app/api/ai/providers/_local'

export async function POST(req: Request) {
  return apiOk({ id: randomUUID(), ...(await readBody(req)), status: 'active' }, '/api/ai/providers/extension/recipes')
}
