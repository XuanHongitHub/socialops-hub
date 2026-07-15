/**
 * Local video generation model list for Publish AI Assistant.
 * Cloud path is ai/models/video/generation — missing in SOCIALOPS_LOCAL_MODE → 404 toast.
 */
import { discoverGrokModels } from '@/app/api/ai/providers/grok/_client'

export async function GET() {
  try {
    const grokModels = await discoverGrokModels().catch(() => [])
    const video = grokModels.filter(
      m => m.type === 'video' || /video|imagine-video/i.test(m.id),
    )
    const data = (video.length
      ? video
      : [
          { id: 'grok-imagine-video', ownedBy: 'xAI', type: 'video' as const },
          { id: 'grok-imagine-video-1.5', ownedBy: 'xAI', type: 'video' as const },
        ]
    ).map(model => ({
      name: `grok::${model.id}`,
      description: model.id,
      channel: 'grok',
      tags: ['Grok', 'xAI', 'video'],
      mainTag: /1\.5/.test(model.id),
      // Shape expected by PublishDialogAi settings
      duration: [6, 10, 15],
      resolution: ['480p', '720p'],
      aspect_ratio: ['9:16', '16:9', '1:1', '3:4', '4:3'],
    }))

    return Response.json({
      code: 0,
      data,
      message: 'ok',
      url: '/api/ai/models/video/generation',
    }, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    })
  }
  catch (e) {
    return Response.json({
      code: 0,
      data: [
        {
          name: 'grok::grok-imagine-video',
          description: 'Grok Imagine Video',
          channel: 'grok',
          tags: ['Grok', 'video'],
        },
      ],
      message: e instanceof Error ? e.message : 'fallback',
      url: '/api/ai/models/video/generation',
    })
  }
}
