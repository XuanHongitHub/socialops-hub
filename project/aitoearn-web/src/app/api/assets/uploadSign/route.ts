/**
 * Local stand-in for cloud POST /assets/uploadSign
 * Used when NEXT_PUBLIC_API_URL=/api (SocialOps local mode).
 */
import { createLocalUploadSign, okJson } from '../_local'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as {
      filename?: string
      size?: number
      type?: string
      contentType?: string
    }
    const signed = await createLocalUploadSign({
      filename: body.filename,
      size: body.size,
      type: body.type,
      contentType: body.contentType,
    })
    return okJson(signed, '/api/assets/uploadSign')
  }
  catch (error) {
    return Response.json({
      code: 500,
      data: null,
      message: error instanceof Error ? error.message : 'uploadSign failed',
      url: '/api/assets/uploadSign',
    }, { status: 500 })
  }
}
