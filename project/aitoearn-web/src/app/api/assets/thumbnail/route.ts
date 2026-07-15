export async function GET() {
  return Response.json({ code: 0, data: { thumbnailUrl: '' }, message: 'ok', url: '/api/assets/thumbnail' })
}
