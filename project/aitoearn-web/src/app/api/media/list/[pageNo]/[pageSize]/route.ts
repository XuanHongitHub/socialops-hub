import { getMaterials } from '@/app/api/material/_local'

/** Flatten generated materials into media list for All / Video / Image tabs. */
export async function GET(req: Request, { params }: { params: Promise<{ pageNo: string, pageSize: string }> }) {
  try {
    const { pageNo, pageSize } = await params
    const page = Math.max(1, Number(pageNo) || 1)
    const size = Math.max(1, Math.min(100, Number(pageSize) || 50))
    const url = new URL(req.url)
    // Client may send groupId or materialGroupId (draft-box All tab uses materialGroupId).
    const groupId = url.searchParams.get('groupId')
      || url.searchParams.get('materialGroupId')
      || undefined
    const type = url.searchParams.get('type') // video | img

    const materials = await getMaterials()
    const rows = materials
      .filter(m => !groupId || m.groupId === groupId)
      .flatMap((material) => {
        return (material.mediaList || []).map((media, index) => {
          // Prefer product/ref cover — never use .mp4 as image thumb
          const coverUrl = (material.coverUrl && !/\.mp4($|\?)/i.test(material.coverUrl))
            ? material.coverUrl
            : (media.type === 'img'
                ? media.url
                : (typeof material.generationParams?.productImageUrl === 'string'
                    ? material.generationParams.productImageUrl
                    : undefined))
          return {
            _id: `${material.id}_${index}`,
            id: `${material.id}_${index}`,
            type: media.type,
            url: media.url,
            title: material.title,
            coverUrl,
            // MediaCard reads thumbUrl — keep in sync so list doesn't fall back to .mp4
            thumbUrl: coverUrl || (media.type === 'img' ? media.url : undefined),
            groupId: material.groupId,
            createdAt: material.createdAt,
            materialId: material.id,
          }
        })
      })
      .filter((row) => {
        if (!type)
          return true
        if (type === 'video')
          return row.type === 'video'
        if (type === 'img' || type === 'image')
          return row.type === 'img'
        return true
      })

    const start = (page - 1) * size
    return Response.json({
      code: 0,
      data: { list: rows.slice(start, start + size), total: rows.length },
      message: 'ok',
      url: `/api/media/list/${pageNo}/${pageSize}`,
    })
  }
  catch (error) {
    return Response.json({
      code: 500,
      data: { list: [], total: 0 },
      message: error instanceof Error ? error.message : String(error),
      url: '/api/media/list',
    }, { status: 500 })
  }
}
