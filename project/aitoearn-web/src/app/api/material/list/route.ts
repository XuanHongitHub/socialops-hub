import { deleteMaterialsByIds } from '../_local'

/** Batch delete materials: DELETE body { ids: string[] } */
export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as { ids?: string[] }
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : []
    const result = await deleteMaterialsByIds(ids)
    return Response.json({
      code: 0,
      data: result,
      message: 'ok',
      url: '/api/material/list',
    })
  }
  catch (error) {
    return Response.json({
      code: 500,
      data: null,
      message: error instanceof Error ? error.message : String(error),
      url: '/api/material/list',
    }, { status: 500 })
  }
}
