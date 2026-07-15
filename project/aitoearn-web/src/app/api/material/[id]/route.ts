import { deleteMaterialsByIds } from '../_local'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const result = await deleteMaterialsByIds([id])
    return Response.json({
      code: 0,
      data: result,
      message: 'ok',
      url: `/api/material/${id}`,
    })
  }
  catch (error) {
    return Response.json({
      code: 500,
      data: null,
      message: error instanceof Error ? error.message : String(error),
      url: '/api/material/[id]',
    }, { status: 500 })
  }
}
