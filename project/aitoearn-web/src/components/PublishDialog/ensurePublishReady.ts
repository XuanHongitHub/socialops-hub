/**
 * After SEO fill / draft prefill: normalize video + image dims + auto-pick Pinterest board
 * so validation warnings don't linger when content is already social-ready.
 */
import { PlatType } from '@/app/config/platConfig'
import type { IImgFile, IPubParams, IVideoFile, PubItem } from '@/components/PublishDialog/publishDialog.type'
import {
  normalizeImageDimsForPublish as normalizeImageDimsPure,
  normalizeVideoDimsForSocial as normalizeVideoDimsPure,
  SOCIAL_IMAGE_FALLBACK,
} from '@/components/PublishDialog/publishReadyDims'
import { usePublishDialogData } from '@/components/PublishDialog/usePublishDialogData'

/** Ensure video has valid 9:16 (or gen) pixel size for IG/YT checks. */
export function normalizeVideoDimsForSocial(
  video: IVideoFile | undefined,
  aspectHint = '9:16',
): IVideoFile | undefined {
  return normalizeVideoDimsPure(video, aspectHint) as IVideoFile | undefined
}

/** Stamp image dims when draft left 0×0 (avoids TikTok min-resolution false fails). */
export function normalizeImagesForPublish(
  images: IImgFile[] | undefined,
): IImgFile[] | undefined {
  return normalizeImageDimsPure(images, SOCIAL_IMAGE_FALLBACK) as IImgFile[] | undefined
}

/** Auto-select first board for every Pinterest account missing boardId. Creates one if list empty. */
export async function ensurePinterestBoards(
  items: PubItem[],
  setOnePubParams: (params: Partial<IPubParams>, accountId: string) => void,
): Promise<number> {
  let fixed = 0
  const pinItems = items.filter(i => i.account.type === PlatType.Pinterest)
  for (const item of pinItems) {
    if (item.params.option?.pinterest?.boardId)
      continue
    try {
      let list = await usePublishDialogData.getState().getPinterestBoards(true, item.account.id)
      let boards = Array.isArray(list)
        ? list
        : usePublishDialogData.getState().pinterestBoards || []

      // No boards yet → create a default so publish isn't blocked
      if (!boards.length) {
        try {
          const { createPinterestBoardApi } = await import('@/api/pinterest')
          const created: any = await createPinterestBoardApi(
            { name: 'SocialOps' },
            item.account.id,
          )
          const board = created?.data || created
          if (board?.id) {
            boards = [board]
            usePublishDialogData.setState({ pinterestBoards: boards as any })
          }
          else {
            // refresh after create
            list = await usePublishDialogData.getState().getPinterestBoards(true, item.account.id)
            boards = Array.isArray(list) ? list : usePublishDialogData.getState().pinterestBoards || []
          }
        }
        catch {
          // create failed — leave warning for user
        }
      }

      const first = boards[0]
      if (!first?.id)
        continue
      setOnePubParams(
        {
          option: {
            ...item.params.option,
            pinterest: {
              ...(item.params.option?.pinterest || {}),
              boardId: first.id,
            },
          },
        },
        item.account.id,
      )
      fixed++
    }
    catch {
      // token / API failure
    }
  }
  return fixed
}

/** Apply media + board fixes across selected publish accounts. */
export async function ensureAllAccountsPublishReady(
  items: PubItem[],
  setOnePubParams: (params: Partial<IPubParams>, accountId: string) => void,
  aspectHint = '9:16',
) {
  for (const item of items) {
    const patch: Partial<IPubParams> = {}
    const video = normalizeVideoDimsForSocial(item.params.video, aspectHint)
    if (video && (
      video.width !== item.params.video?.width
      || video.height !== item.params.video?.height
    )) {
      patch.video = video
    }
    const images = normalizeImagesForPublish(item.params.images)
    if (images && images !== item.params.images) {
      patch.images = images
    }
    if (Object.keys(patch).length > 0)
      setOnePubParams(patch, item.account.id)
  }
  await ensurePinterestBoards(items, setOnePubParams)
}
