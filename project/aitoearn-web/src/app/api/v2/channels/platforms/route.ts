import { NextResponse } from 'next/server'
import { PlatformStatus } from '@/api/channels/channel.constants'
import type { PlatformMetadataVo } from '@/api/channels/channel.types'
import { AccountPlatInfoMap, PlatType } from '@/app/config/platConfig'

/**
 * Local SocialOps stub for platform metadata when remote aitoearn-server is offline.
 * GET /api/v2/channels/platforms
 */
export async function GET() {
  const list: PlatformMetadataVo[] = Array.from(AccountPlatInfoMap.entries()).map(([platform, info]) => {
    const isVideoHeavy = [
      PlatType.Tiktok,
      PlatType.YouTube,
      PlatType.Douyin,
      PlatType.KWAI,
      PlatType.WxSph,
      PlatType.BILIBILI,
      PlatType.Instagram,
    ].includes(platform)

    return {
      platform,
      status: PlatformStatus.Available,
      displayName: { en: info.name, 'zh-CN': info.name },
      logoUrl: info.icon,
      authType: 'oauth' as any,
      editor: 'standard' as any,
      contentLimits: {
        titleMax: 100,
        desMax: 2200,
        imagesMax: 10,
      } as any,
      mediaRules: {
        video: isVideoHeavy,
        image: true,
        maxVideoDuration: 600,
      } as any,
      topic: {
        max: 8,
        maxTotalLength: 200,
      } as any,
      capabilities: {
        publish: true,
        schedule: true,
        engagement: {},
        work: {},
        browse: {},
        webhook: {},
      } as any,
      optionSchema: {},
      defaultOption: {},
    }
  })

  return NextResponse.json({
    code: 0,
    data: list,
    message: 'ok',
    url: '/api/v2/channels/platforms',
  })
}
