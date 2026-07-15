import { NextResponse } from 'next/server'
import { getAccounts } from '@/app/api/ai/providers/_local'

const providers = [
  { id: 'grok', name: 'Grok', category: 'oauth', capabilities: ['chat', 'image', 'video'], authModes: ['oauth', 'cookie_import'], status: 'ready', accountCount: 0, activeAccountCount: 0 },
  { id: 'chatgpt', name: 'ChatGPT', category: 'oauth', capabilities: ['chat'], authModes: ['oauth', 'cookie_import'], status: 'planned', accountCount: 0, activeAccountCount: 0 },
  { id: 'codex', name: 'OpenAI Codex', category: 'oauth', capabilities: ['chat', 'workflow'], authModes: ['oauth'], status: 'ready', accountCount: 0, activeAccountCount: 0 },
  { id: 'claude', name: 'Claude Code', category: 'oauth', capabilities: ['chat'], authModes: ['oauth'], status: 'planned', accountCount: 0, activeAccountCount: 0 },
  { id: 'gemini', name: 'Gemini', category: 'free_tier', capabilities: ['chat'], authModes: ['api_key', 'oauth'], status: 'planned', accountCount: 0, activeAccountCount: 0 },
  { id: 'openrouter', name: 'OpenRouter', category: 'free_tier', capabilities: ['chat'], authModes: ['api_key'], status: 'planned', accountCount: 0, activeAccountCount: 0 },
  { id: 'groq', name: 'Groq', category: 'api_key', capabilities: ['chat'], authModes: ['api_key'], status: 'ready', accountCount: 0, activeAccountCount: 0 },
  { id: 'anthropic', name: 'Anthropic', category: 'api_key', capabilities: ['chat'], authModes: ['api_key'], status: 'planned', accountCount: 0, activeAccountCount: 0 },
]

export async function GET() {
  const accounts = await getAccounts()
  const data = providers.map(provider => {
    const providerAccounts = accounts.filter(account => account.providerId === provider.id)
    return {
      ...provider,
      accountCount: providerAccounts.length,
      activeAccountCount: providerAccounts.filter(account => account.status !== 'disabled').length,
    }
  })
  return NextResponse.json({ code: 0, data, message: 'ok', url: '/api/ai/providers' })
}
