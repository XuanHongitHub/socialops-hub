import type { ForwardedRef } from 'react'
import { ImageOff } from 'lucide-react'
import { forwardRef, memo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigation, Pagination } from 'swiper/modules'
import { Swiper, SwiperSlide } from 'swiper/react'
import { useShallow } from 'zustand/react/shallow'
import { usePublishDialog } from '@/components/PublishDialog/usePublishDialog'
import 'swiper/css'
import 'swiper/css/pagination'

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes === 0)
    return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

// 格式化时长
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  else {
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }
}

export interface IPublishDialogPreviewRef {}

export interface IPublishDialogPreviewProps {}

// 预览
const PublishDialogPreview = memo(
  forwardRef((_: IPublishDialogPreviewProps, ref: ForwardedRef<IPublishDialogPreviewRef>) => {
    const { t } = useTranslation('publish')
    const { expandedPubItem, pubListChoosed, commonPubParams } = usePublishDialog(
      useShallow(state => ({
        expandedPubItem: state.expandedPubItem,
        pubList: state.pubList,
        pubListChoosed: state.pubListChoosed,
        commonPubParams: state.commonPubParams,
      })),
    )
    const videoRef = useRef<HTMLVideoElement>(null)

    // Prefer expanded account; fall back to any selected account / common params with media
    // (draft prefill can race and leave expandedPubItem empty briefly)
    const previewItem = (() => {
      if (expandedPubItem?.params.video || (expandedPubItem?.params.images?.length ?? 0) > 0)
        return expandedPubItem
      const fromChosen = pubListChoosed?.find(
        i => i.params.video || (i.params.images?.length ?? 0) > 0,
      )
      if (fromChosen)
        return fromChosen
      if (commonPubParams?.video || (commonPubParams?.images?.length ?? 0) > 0) {
        return {
          account: expandedPubItem?.account || pubListChoosed?.[0]?.account,
          params: commonPubParams,
        } as typeof expandedPubItem
      }
      return expandedPubItem
    })()

    useEffect(() => {
      if (!previewItem) {
        videoRef.current?.pause()
      }
    }, [previewItem])

    return (
      <div className="bg-background w-[380px] overflow-hidden rounded-lg ml-[15px] h-[calc(100vh-80px)] flex flex-col">
        <div className="text-left min-w-[380px] flex flex-col h-full min-h-0">
          <div className="font-semibold text-base px-5 pt-5 flex-shrink-0">
            {t('preview.title')}
          </div>
          {previewItem
            && (previewItem?.params.video
              || (previewItem?.params.images && previewItem?.params.images?.length !== 0)) ? (
                <div className="p-5 flex-1 min-h-0 flex flex-col">
                  {previewItem?.params.video ? (
                    <div className="bg-black rounded-[30px] overflow-hidden box-border relative w-full flex-1 min-h-0 flex flex-col">
                      <div className="m-[5px] box-border flex-1 min-h-0 rounded-[30px] overflow-hidden flex flex-col">
                        <div className="absolute w-1/2 h-5 z-[8] rounded-b-[15px] top-0 left-1/2 -translate-x-1/2 bg-black" />
                        <div className="flex-1 min-h-0 flex items-center justify-center">
                          <video
                            ref={videoRef}
                            src={previewItem.params.video?.videoUrl}
                            controls
                            playsInline
                            poster={previewItem.params.video?.cover?.imgUrl}
                            className="w-full max-h-full object-contain rounded-none"
                          />
                        </div>
                        {/* 视频信息显示 */}
                        <div className="bg-black/90 text-white p-3 rounded-b-[30px] text-xs border-t border-white/10 flex-shrink-0">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-semibold text-white/60 min-w-[60px] text-shadow">
                              {t('preview.videoInfo.filename' as any)}
                              :
                            </span>
                            <span className="text-white font-medium text-right flex-1 ml-2 text-shadow">
                              {previewItem.params.video?.filename || 'Unknown'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-semibold text-white/60 min-w-[60px] text-shadow">
                              {t('preview.videoInfo.format' as any)}
                              :
                            </span>
                            <span className="text-white font-medium text-right flex-1 ml-2 text-shadow">
                              {previewItem.params.video?.filename
                                ?.split('.')
                                .pop()
                                ?.toUpperCase() || 'Unknown'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-semibold text-white/60 min-w-[60px] text-shadow">
                              {t('preview.videoInfo.resolution' as any)}
                              :
                            </span>
                            <span className="text-white font-medium text-right flex-1 ml-2 text-shadow">
                              {previewItem.params.video?.width
                                && previewItem.params.video?.height
                                ? `${previewItem.params.video.width}x${previewItem.params.video.height}`
                                : 'Unknown'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-semibold text-white/60 min-w-[60px] text-shadow">
                              {t('preview.videoInfo.size' as any)}
                              :
                            </span>
                            <span className="text-white font-medium text-right flex-1 ml-2 text-shadow">
                              {previewItem.params.video?.size
                                ? formatFileSize(previewItem.params.video.size)
                                : 'Unknown'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-white/60 min-w-[60px] text-shadow">
                              {t('preview.videoInfo.duration' as any)}
                              :
                            </span>
                            <span className="text-white font-medium text-right flex-1 ml-2 text-shadow">
                              {previewItem.params.video?.duration
                                ? formatDuration(previewItem.params.video.duration)
                                : 'Unknown'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-black rounded-[30px] overflow-hidden box-border relative w-full flex-1 min-h-0 flex flex-col">
                      <div className="m-[5px] box-border flex-1 min-h-0 rounded-[30px] overflow-hidden flex flex-col justify-center">
                        <div className="absolute w-1/2 h-5 z-[8] rounded-b-[15px] top-0 left-1/2 -translate-x-1/2 bg-black" />
                        <div className="bg-white h-full box-border px-2.5 flex items-center [&_.swiper-pagination-bullet]:bg-primary [&_.swiper]:h-full [&_.swiper-slide]:h-full [&_img]:w-full [&_img]:h-full [&_img]:object-contain flex-1 min-h-0">
                          <Swiper
                            loop={(previewItem!.params.images?.length || 0) > 1}
                            modules={[Navigation, Pagination]}
                            pagination={{
                              clickable: true,
                              el: '.swiper-pagination',
                            }}
                          >
                            {previewItem!.params.images!.map((image, index) => (
                              <SwiperSlide key={index + image.imgUrl}>
                                <img src={image.imgUrl} alt={`Image ${index + 1}`} />
                              </SwiperSlide>
                            ))}
                          </Swiper>
                          <div className="swiper-pagination"></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
                    <ImageOff className="h-12 w-12 opacity-40" />
                    <p className="text-sm">{t('preview.emptyDescription')}</p>
                  </div>
                </div>
              )}
        </div>
      </div>
    )
  }),
)

export default PublishDialogPreview
