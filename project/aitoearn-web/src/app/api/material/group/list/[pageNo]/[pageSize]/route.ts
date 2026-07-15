import { getMaterialGroups } from '../../../../_local'

export async function GET(_req: Request, { params }: { params: Promise<{ pageNo: string, pageSize: string }> }) {
  try {
    const { pageNo, pageSize } = await params
    const page = Math.max(1, Number(pageNo) || 1)
    const size = Math.max(1, Math.min(100, Number(pageSize) || 50))
    const groups = await getMaterialGroups()
    return Response.json({
      code: 0,
      data: {
        list: groups.slice((page - 1) * size, page * size),
        total: groups.length,
      },
      message: 'ok',
      url: `/api/material/group/list/${pageNo}/${pageSize}`,
    })
  }
  catch (error) {
    return Response.json({
      code: 500,
      data: { list: [], total: 0 },
      message: error instanceof Error ? error.message : String(error),
      url: '/api/material/group/list',
    }, { status: 500 })
  }
}
