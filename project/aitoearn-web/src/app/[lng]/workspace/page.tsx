import type { Metadata } from 'next'
import { WorkspaceConsole } from '@/components/Workspace/WorkspaceConsole'
import { getMetadata } from '@/utils/metadata'
import { fallbackLng, languages } from '@/app/i18n/settings'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>
}): Promise<Metadata> {
  let { lng } = await params
  if (!languages.includes(lng))
    lng = fallbackLng

  return getMetadata(
    {
      title: 'Browser Workspace',
      description: 'CDP profiles, extension bridge, recipes, and live browser automation workspace.',
      keywords: 'cdp, browser profile, extension bridge, automation workspace, socialops',
    },
    lng,
  )
}

export default function WorkspacePage() {
  return (
    <div className="h-[calc(100vh-0px)] min-h-[640px] w-full overflow-hidden">
      <WorkspaceConsole />
    </div>
  )
}
