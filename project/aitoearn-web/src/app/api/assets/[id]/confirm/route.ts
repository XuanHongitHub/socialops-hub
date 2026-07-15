/**
 * Local stand-in for cloud POST /assets/:id/confirm
 */
import { confirmLocalUpload, okJson } from '../../_local'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const result = await confirmLocalUpload(id)
    if (!result) {
      return Response.json({
        code: 404,
        data: null,
        message: 'Asset not found',
        url: `/api/assets/${id}/confirm`,
      }, { status: 404 })
    }
    return okJson(result, `/api/assets/${id}/confirm`)
  }
  catch (error) {
    return Response.json({
      code: 500,
      data: null,
      message: error instanceof Error ? error.message : 'confirm failed',
      url: `/api/assets/${id}/confirm`,
    }, { status: 500 })
  }
}
