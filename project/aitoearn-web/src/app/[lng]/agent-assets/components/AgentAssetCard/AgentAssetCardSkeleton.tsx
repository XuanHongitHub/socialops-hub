/**
 * AgentAssetCardSkeleton - Agent 素材卡片骨架屏
 */

'use client'

import { Skeleton } from '@/components/ui/skeleton'

const SKELETON_HEIGHTS = [176, 208, 160, 224, 192]

export function AgentAssetCardSkeleton({ index = 0 }: { index?: number }) {
  const height = SKELETON_HEIGHTS[index % SKELETON_HEIGHTS.length]

  return (
    <div className="rounded-lg overflow-hidden">
      <Skeleton className="w-full" style={{ height: `${height}px` }} />
    </div>
  )
}