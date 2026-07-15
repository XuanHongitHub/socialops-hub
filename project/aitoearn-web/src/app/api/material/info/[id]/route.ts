/**
 * Local material info GET/PUT — used by draft detail Edit save & Regen copy.
 */
import { getMaterialById, updateMaterialById } from '@/app/api/material/_local'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const material = await getMaterialById(id)
    if (!material) {
      return Response.json({
        code: 404,
        data: null,
        message: 'Material not found',
        url: `/api/material/info/${id}`,
      }, { status: 404 })
    }
    return Response.json({
      code: 0,
      data: material,
      message: 'ok',
      url: `/api/material/info/${id}`,
    })
  }
  catch (error) {
    return Response.json({
      code: 500,
      data: null,
      message: error instanceof Error ? error.message : String(error),
      url: '/api/material/info/[id]',
    }, { status: 500 })
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const patch: Record<string, unknown> = {}
    if (typeof body.title === 'string')
      patch.title = body.title
    if (typeof body.desc === 'string')
      patch.desc = body.desc
    if (Array.isArray(body.topics))
      patch.topics = body.topics.map(String)
    if (typeof body.coverUrl === 'string')
      patch.coverUrl = body.coverUrl
    if (Array.isArray(body.mediaList))
      patch.mediaList = body.mediaList
    if (body.option && typeof body.option === 'object')
      patch.option = body.option
    if (Array.isArray(body.accountTypes))
      patch.accountTypes = body.accountTypes.map(String)
    if (body.generationParams && typeof body.generationParams === 'object')
      patch.generationParams = body.generationParams

    const material = await updateMaterialById(id, patch as any)
    if (!material) {
      return Response.json({
        code: 404,
        data: null,
        message: 'Material not found',
        url: `/api/material/info/${id}`,
      }, { status: 404 })
    }
    return Response.json({
      code: 0,
      data: material,
      message: 'ok',
      url: `/api/material/info/${id}`,
    })
  }
  catch (error) {
    return Response.json({
      code: 500,
      data: null,
      message: error instanceof Error ? error.message : String(error),
      url: '/api/material/info/[id]',
    }, { status: 500 })
  }
}
