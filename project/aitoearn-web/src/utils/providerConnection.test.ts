import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ProviderAccountItem } from '@/api/aiProviders'
import { getConnectionIdentity, healthTone, isProviderEmail } from './providerConnection'

function acc(partial: Partial<ProviderAccountItem> & Pick<ProviderAccountItem, 'id' | 'providerId' | 'name' | 'authMode' | 'status'>): ProviderAccountItem {
  return {
    hasCredentials: true,
    ...partial,
  }
}

describe('isProviderEmail', () => {
  it('accepts normal emails', () => {
    assert.equal(isProviderEmail('westydoctorihan@hotmail.com'), true)
  })
  it('rejects display names', () => {
    assert.equal(isProviderEmail('Grok Account 2'), false)
  })
})

describe('getConnectionIdentity', () => {
  it('prefers metadata.email over generic account name', () => {
    const id = getConnectionIdentity(acc({
      id: '1',
      providerId: 'grok',
      name: 'Grok Account 2',
      authMode: 'oauth',
      status: 'active',
      metadata: { email: 'westydoctorihan@hotmail.com', username: 'westydoctorihan', source: 'xai_oauth' },
    }))
    assert.equal(id.primary, 'westydoctorihan@hotmail.com')
    assert.equal(id.username, '@westydoctorihan')
    assert.equal(id.source, 'xai_oauth')
    assert.equal(id.isRoutable, true)
  })

  it('uses email-like name when metadata email missing', () => {
    const id = getConnectionIdentity(acc({
      id: '2',
      providerId: 'grok',
      name: 'nxhytb2004@gmail.com',
      authMode: 'cookie_import',
      status: 'active',
      metadata: { source: 'local_import' },
    }))
    assert.equal(id.primary, 'nxhytb2004@gmail.com')
    assert.ok(id.secondary?.includes('cookie session'))
  })

  it('marks 9router metadata-only rows as not routable', () => {
    const id = getConnectionIdentity(acc({
      id: '3',
      providerId: 'xai',
      name: 'ghost@example.com',
      authMode: 'oauth',
      status: 'active',
      hasCredentials: false,
      metadata: { source: '9router', email: 'ghost@example.com' },
    }))
    assert.equal(id.isRoutable, false)
    assert.ok(id.secondary?.includes('import shell'))
  })

  it('falls back to account name when no email/username', () => {
    const id = getConnectionIdentity(acc({
      id: '4',
      providerId: 'groq',
      name: 'Production key',
      authMode: 'api_key',
      status: 'active',
    }))
    assert.equal(id.primary, 'Production key')
    assert.equal(id.source, 'api_key')
  })
})

describe('healthTone', () => {
  it('maps healthy statuses', () => {
    assert.equal(healthTone('ok'), 'ok')
    assert.equal(healthTone('Ready'), 'ok')
    assert.equal(healthTone('n/a'), 'muted')
    assert.equal(healthTone('failed'), 'bad')
  })
})
