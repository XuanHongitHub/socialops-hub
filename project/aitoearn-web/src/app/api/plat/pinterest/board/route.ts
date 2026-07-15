/**
 * Local Pinterest boards for Publish Work.
 * Always returns JSON 200 with soft errors — never HTTP 500 toast spam.
 */
import { accountFile, readJson, type LocalSocialAccount } from '@/app/api/plat/meta/_local'

function isPinterest(type: unknown) {
  return String(type || '').toLowerCase() === 'pinterest'
}

async function getPinterestAccount(accountId: string) {
  const accounts = await readJson<LocalSocialAccount[]>(accountFile, [])
  const list = Array.isArray(accounts) ? accounts : []
  if (accountId) {
    const byId = list.find(a => a.id === accountId)
    if (byId && isPinterest(byId.type))
      return byId
    // id match without type (some stores omit type casing)
    if (byId?.access_token)
      return byId
  }
  const first = list.find(a => isPinterest(a.type) && a.access_token)
  if (first)
    return first
  return null
}

function normalizeBoards(data: any): Array<{ id: string, name: string, description?: string, privacy?: string }> {
  const items = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.list)
      ? data.list
      : Array.isArray(data)
        ? data
        : []
  return items
    .map((b: any) => ({
      id: String(b?.id || b?.board_id || ''),
      name: String(b?.name || b?.title || 'Board'),
      description: b?.description != null ? String(b.description) : undefined,
      privacy: b?.privacy != null ? String(b.privacy) : undefined,
    }))
    .filter((b: { id: string }) => Boolean(b.id))
}

/** Soft OK payload so request.ts does not toast (code === 0). */
function okList(list: ReturnType<typeof normalizeBoards>, message = 'ok') {
  return Response.json(
    {
      code: 0,
      data: { list, items: list, total: list.length },
      message,
      url: '/api/plat/pinterest/board',
    },
    { status: 200 },
  )
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const accountId = String(url.searchParams.get('accountId') || '').trim()
    const account = await getPinterestAccount(accountId)
    if (!account?.access_token) {
      return okList([], 'Pinterest account or token missing — reconnect Pinterest')
    }

    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('size') || 50) || 50))
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15_000)
    let response: Response
    try {
      response = await fetch(`https://api.pinterest.com/v5/boards?page_size=${pageSize}`, {
        headers: {
          Authorization: `Bearer ${account.access_token}`,
          Accept: 'application/json',
        },
        cache: 'no-store',
        signal: controller.signal,
      })
    }
    finally {
      clearTimeout(timer)
    }

    const raw = await response.text()
    let data: any = null
    try {
      data = raw ? JSON.parse(raw) : {}
    }
    catch {
      data = { message: raw?.slice(0, 200) }
    }

    if (!response.ok) {
      // Soft-fail: empty list, still code 0 so UI toast does not fire as "Request failed (500)"
      console.warn('[pinterest/board] upstream', response.status, data?.message || data?.code)
      return okList(
        [],
        String(data?.message || data?.message_detail || `Pinterest boards unavailable (${response.status})`),
      )
    }

    return okList(normalizeBoards(data))
  }
  catch (error) {
    console.warn('[pinterest/board] GET', error)
    return okList(
      [],
      error instanceof Error ? error.message : 'Unable to load Pinterest boards',
    )
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as {
      accountId?: string
      name?: string
      description?: string
      privacy?: string
    }
    const account = await getPinterestAccount(String(body.accountId || ''))
    if (!account?.access_token) {
      return Response.json({
        code: 400,
        data: null,
        message: 'Pinterest account or token missing — reconnect Pinterest',
        url: '/api/plat/pinterest/board',
      }, { status: 200 })
    }

    const name = String(body.name || '').trim()
    if (!name) {
      return Response.json({
        code: 400,
        data: null,
        message: 'Board name is required',
        url: '/api/plat/pinterest/board',
      }, { status: 200 })
    }

    const response = await fetch('https://api.pinterest.com/v5/boards', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.access_token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        name,
        description: body.description || 'Created by SocialOps',
        privacy: body.privacy || 'PUBLIC',
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    const raw = await response.text()
    let data: any = null
    try {
      data = raw ? JSON.parse(raw) : {}
    }
    catch {
      data = { message: raw?.slice(0, 200) }
    }

    if (!response.ok) {
      return Response.json({
        code: response.status,
        data: null,
        message: String(data?.message || `Unable to create board (${response.status})`),
        url: '/api/plat/pinterest/board',
      }, { status: 200 })
    }

    return Response.json({
      code: 0,
      data: {
        id: String(data?.id || ''),
        name: String(data?.name || name),
        description: data?.description,
        privacy: data?.privacy,
      },
      message: 'ok',
      url: '/api/plat/pinterest/board',
    })
  }
  catch (error) {
    return Response.json({
      code: 500,
      data: null,
      message: error instanceof Error ? error.message : 'Unable to create Pinterest board',
      url: '/api/plat/pinterest/board',
    }, { status: 200 })
  }
}
