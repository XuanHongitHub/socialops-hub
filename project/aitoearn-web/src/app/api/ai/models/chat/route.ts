import { discoverGrokModels } from '@/app/api/ai/providers/grok/_client'

export async function GET(req: Request) {
  const scene = new URL(req.url).searchParams.get('scene') || 'web'
  const grokModels = await discoverGrokModels().catch(() => [])
  const data = [
    {
      name: 'cx_agy',
      description: '9Router CX Agent',
      channel: '9router',
      scenes: [scene],
      inputModalities: ['text'],
      outputModalities: ['text'],
      tags: ['9Router', 'chat'],
      mainTag: true,
      pricing: { prompt: '9Router', completion: '9Router' },
    },
    ...grokModels.filter(model => model.type !== 'video' && !/video|imagine/i.test(model.id)).map(model => ({
      name: `grok::${model.id}`,
      description: model.id,
      channel: 'grok',
      scenes: [scene],
      inputModalities: ['text'],
      outputModalities: ['text'],
      tags: ['Grok', 'xAI OAuth'],
      mainTag: false,
      pricing: { prompt: 'xAI account', completion: 'xAI account' },
    })),
  ]
  return Response.json({ code: 0, data, message: 'ok', url: '/api/ai/models/chat' })
}
