import { completeLocalTask, createLocalTask, getTasks, jsonOk } from '../_local'

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const page = Number(url.searchParams.get('page') || 1)
  const pageSize = Number(url.searchParams.get('pageSize') || 10)
  const keyword = String(url.searchParams.get('keyword') || '').toLowerCase()
  const all = (await getTasks()).filter(task => !keyword || task.title.toLowerCase().includes(keyword) || task.prompt.toLowerCase().includes(keyword))
  const list = all.slice((page - 1) * pageSize, page * pageSize).map(({ messages: _messages, ...task }) => task)
  return jsonOk({ page, pageSize, totalPages: Math.ceil(all.length / pageSize), total: all.length, list }, '/api/agent/tasks')
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const task = await createLocalTask(body.prompt || '', body.taskId, body.model ? String(body.model) : undefined)
  const accept = req.headers.get('accept') || ''
  if (!accept.includes('text/event-stream')) return jsonOk({ id: task.id }, '/api/agent/tasks')

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(sse(data)))
      send({ type: 'init', taskId: task.id })
      send({ type: 'text', message: 'Generating with Socials Hub provider router...' })
      const done = await completeLocalTask(task.id)
      if (done.status === 'error') send({ type: 'error', message: done.errorMessage })
      else {
        const assistant = done.messages.findLast(message => message.type === 'assistant')
        const result = done.messages.findLast(message => message.type === 'result')
        const assistantText = assistant?.message?.content?.find((item: any) => item.type === 'text')?.text
        if (assistantText) send({ type: 'text', message: assistantText })
        if (result?.result) send({ type: 'result', message: result.message, data: result.result })
      }
      send({ type: 'done', taskId: task.id })
      controller.close()
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' } })
}

