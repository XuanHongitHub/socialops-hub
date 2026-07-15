import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest, NextResponse } from 'next/server'

const appData = process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
const dataDir = process.env.DATA_DIR || join(appData, '9router')
const tokenSalt = '9r-cli-auth'

function cliToken() {
  const machineIdPath = join(dataDir, 'machine-id')
  const secretPath = join(dataDir, 'auth', 'cli-secret')
  if (!existsSync(machineIdPath) || !existsSync(secretPath)) return ''
  const machineId = readFileSync(machineIdPath, 'utf8').trim()
  const secret = readFileSync(secretPath, 'utf8').trim()
  return createHash('sha256').update(machineId + tokenSalt + secret).digest('hex').substring(0, 16)
}

function sanitize(value: unknown) {
  if (!value || typeof value !== 'object') return value
  const payload = value as Record<string, unknown>
  if (Array.isArray(payload.connections)) {
    return {
      ...payload,
      connections: payload.connections.map((connection) => {
        const item = connection as Record<string, unknown>
        return {
          id: item.id,
          provider: item.provider,
          authType: item.authType,
          name: item.name,
          email: item.email,
          priority: item.priority,
          isActive: item.isActive,
          testStatus: item.testStatus,
          errorCode: item.errorCode,
          lastError: item.lastError,
          lastErrorAt: item.lastErrorAt,
          lastUsedAt: item.lastUsedAt,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        }
      }),
    }
  }
  return payload
}

async function proxy(method: 'GET' | 'POST', body?: unknown) {
  const res = await fetch('http://localhost:20128/api/providers', {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-9r-cli-token': cliToken(),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  const text = await res.text()
  const output = method === 'GET' && res.ok ? JSON.stringify(sanitize(JSON.parse(text))) : text
  return new NextResponse(output, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json' },
  })
}

export async function GET() {
  return proxy('GET')
}

export async function POST(req: NextRequest) {
  return proxy('POST', await req.json())
}
