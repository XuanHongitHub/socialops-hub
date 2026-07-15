import { listMaterials } from '../../../_local'

export async function GET(req: Request, { params }: { params: Promise<{ pageNo: string, pageSize: string }> }) {
  try {
    const { pageNo, pageSize } = await params
    const page = Math.max(1, Number(pageNo) || 1)
    const size = Math.max(1, Math.min(100, Number(pageSize) || 50))
    const url = new URL(req.url)
    const groupId = url.searchParams.get('groupId') || undefined
    const data = await listMaterials(groupId, page, size)
    return Response.json({
      code: 0,
      data,
      message: 'ok',
      url: `/api/material/list/${pageNo}/${pageSize}`,
    })
  }
  catch (error) {
    return Response.json({
      code: 500,
      data: { list: [], total: 0 },
      message: error instanceof Error ? error.message : String(error),
      url: '/api/material/list',
    }, { status: 500 })
  }
}
