/**
 * Receives the PUT body after uploadSign (same as R2 presigned PUT).
 */
import { saveLocalUploadBody } from '../../_local'

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const contentType = req.headers.get('content-type') || undefined
    const ab = await req.arrayBuffer()
    const buf = Buffer.from(ab)
    if (!buf.length) {
      return Response.json({
        code: 400,
        data: null,
        message: 'Empty upload body',
        url: `/api/assets/local-upload/${id}`,
      }, { status: 400 })
    }
    // Soft size cap 50MB for ref images / media
    if (buf.length > 50 * 1024 * 1024) {
      return Response.json({
        code: 413,
        data: null,
        message: 'File too large (max 50MB)',
        url: `/api/assets/local-upload/${id}`,
      }, { status: 413 })
    }
    const asset = await saveLocalUploadBody(id, buf, contentType)
    if (!asset) {
      return Response.json({
        code: 404,
        data: null,
        message: 'Unknown upload id — call uploadSign first',
        url: `/api/assets/local-upload/${id}`,
      }, { status: 404 })
    }
    return new Response(null, { status: 200 })
  }
  catch (error) {
    return Response.json({
      code: 500,
      data: null,
      message: error instanceof Error ? error.message : 'upload failed',
      url: `/api/assets/local-upload/${id}`,
    }, { status: 500 })
  }
}

// Some clients may POST
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return PUT(req, ctx)
}
