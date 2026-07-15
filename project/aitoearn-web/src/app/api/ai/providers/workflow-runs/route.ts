import { NextResponse } from 'next/server'
import { createWorkflowRun, getWorkflowRuns, readBody } from '@/app/api/ai/providers/_local'

export async function GET() {
  return NextResponse.json({ code: 0, data: await getWorkflowRuns(), message: 'ok', url: '/api/ai/providers/workflow-runs' })
}

export async function POST(req: Request) {
  return NextResponse.json({ code: 0, data: await createWorkflowRun(await readBody(req)), message: 'ok', url: '/api/ai/providers/workflow-runs' })
}
