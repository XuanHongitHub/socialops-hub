import { createMaterialGroup } from '../_local'
export async function POST(req: Request) { const body = await req.json().catch(() => ({})); const group = await createMaterialGroup(String(body.name || ''), body.desc ? String(body.desc) : undefined); return Response.json({ code: 0, data: { id: group.id }, message: 'ok', url: '/api/material/group' }) }
