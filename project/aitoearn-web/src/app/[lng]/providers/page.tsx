import type { Metadata } from 'next'
import { useTranslation } from '@/app/i18n'
import { fallbackLng, languages } from '@/app/i18n/settings'
import { ProvidersTab } from '@/components/SettingsModal/tabs/ProvidersTab'
import { getMetadata } from '@/utils/general'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>
}): Promise<Metadata> {
  let { lng } = await params
  if (!languages.includes(lng))
    lng = fallbackLng
  const { t } = await useTranslation(lng)

  return getMetadata(
    {
      title: 'Provider Console',
      description: 'Manage AI providers, automation profiles, extension queues, and publish dry-runs.',
      keywords: 'provider console, socialops, ai router, automation',
    },
    lng,
  )
}

export default function ProviderConsolePage() {
  return <ProvidersTab />
}
