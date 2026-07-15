/**
 * AiBatchGenerateBar - AI 批量生成内联输入栏
 * 聊天式输入界面：图片堆叠 + 提示词输入 + 工具栏，始终可见
 */

'use client'

import type { IPersistedMedia } from '../../draftBoxConfigStore'
import type { EffectiveLimitsDetailed } from './platformLimits'
import type { DraftContentType, VideoModelType } from '@/api/draftGeneration'
import type { ImageModelInfo, ImageModelPricing, VideoModelInfo, VideoModelPricing } from '@/api/types/draftGeneration'
import type { PlatType } from '@/app/config/platConfig'
import type { IUploadedMedia } from '@/components/Chat/MediaUpload'
import isEqual from 'lodash/isEqual'
import { CircleHelp, Clapperboard, Eye, Loader2, Maximize2, RotateCcw, ShoppingBag, Upload, X } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import VisionProgressPanel, {
  IDLE_VISION_STATE,
  type VisionRunState,
  type VisionStepId,
} from './VisionProgressPanel'
import { useShallow } from 'zustand/react/shallow'
import { usePlanDetailStore } from '@/app/[lng]/brand-promotion/planDetailStore'
import { AccountPlatInfoMap, TASK_EXCLUDED_PLATFORMS, TaskPlatInfoArr } from '@/app/config/platConfig'
import { useTransClient } from '@/app/i18n/client'
import type { ProductPickerSelection } from '@/components/BugSell/ProductPicker'
import { prefetchBugSellCatalog } from '@/api/bugsell'
import { BugSellMark } from '@/components/BugSell/BugSellMark'
import { BugSellProductPicker } from '@/components/BugSell/ProductPicker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useMediaUpload } from '@/hooks/useMediaUpload'
import { useGetClientLng } from '@/hooks/useSystem'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useAccountStore } from '@/store/account'
import { getVideoMeta } from '@/utils/media'
import { getOssUrl } from '@/utils/oss'
import { SOCIAL_OPS_PRODUCT_CHIP_CLASS, SOCIAL_OPS_PRODUCT_THUMB_CLASS } from '@/lib/socialOps/socialOpsShell'
import { useDraftBoxConfigStore } from '../../draftBoxConfigStore'
import { getConnectedPlatforms, resolvePlatformsByPreset } from '../../utils/connectedPlatforms'
import { buildDraftPromptLimitText, mergeCaptionPromptWithSystemRequirement } from '../../utils/promptLimits'
import { resolvePublishReadyGenParams } from './platformCompatibility'
import styles from './AiBatchGenerateBar.module.scss'
import {
  filterVideoPricingByResolution,
  getImageModelsCommonAspectRatios,
  getImageModelsCommonResolutions,
  getImageModelsMaxInputImages,
  getVideoModelDefaultResolution,
  getVideoModelResolutions,
  getVideoModelsCommonResolutions,
  getVideoModelsCommonStaticConfig,
  getVideoModelStaticConfig,
  matchClosestRatio,
} from './constants'
import ImageStack from './ImageStack'
import { checkPlatformCompatibility } from './platformCompatibility'
import { calcEffectiveLimitsDetailed } from './platformLimits'
import PromptEditorDialog from './PromptEditorDialog'
import ToolBarInline from './ToolBarInline'
import { usePricingData } from './usePricingData'

const PROMPT_MAX_LENGTH = 2000

function buildPersistedMediaSignature(
  medias: Array<Pick<IPersistedMedia, 'id' | 'url' | 'type' | 'name' | 'duration'>>,
) {
  return JSON.stringify(
    medias.map(media => [
      media.id,
      media.url,
      media.type,
      media.name ?? '',
      media.duration ?? null,
    ]),
  )
}

type ModelSelectionMode = 'single' | 'multiple'

function applyModelSelectionMode<T>(values: T[], mode: ModelSelectionMode) {
  return mode === 'single' ? values.slice(0, 1) : values
}
function normalizeSelectedValues(selectedValues: string[], availableValues: string[], fallbackValue?: string) {
  const normalized = selectedValues.filter((value, index, array) =>
    availableValues.includes(value) && array.indexOf(value) === index)
  if (normalized.length > 0)
    return normalized
  if (fallbackValue && availableValues.includes(fallbackValue))
    return [fallbackValue]
  return availableValues[0] ? [availableValues[0]] : []
}

function getOptionCompareKey(value?: string) {
  return (value ?? '').trim().replace(/\s+/g, '').toLowerCase()
}

function includesOption(values: string[], value?: string) {
  const compareKey = getOptionCompareKey(value)
  return compareKey.length > 0 && values.some(item => getOptionCompareKey(item) === compareKey)
}

function getVideoDurationLimits(
  models: VideoModelInfo[],
  resolution: string,
  isVideoEditMode: boolean,
) {
  const pricingGroups = models
    .map(model => filterVideoPricingByResolution(model.pricing, resolution, isVideoEditMode))
    .filter(group => group.length > 0)

  if (pricingGroups.length === 0)
    return { min: 4, max: 15 }

  const min = Math.max(...pricingGroups.map(group => Math.min(...group.map(item => item.duration))))
  const max = Math.min(...pricingGroups.map(group => Math.max(...group.map(item => item.duration))))
  return min <= max ? { min, max } : { min: 4, max: 15 }
}

function getNearestVideoPricing(pricing: VideoModelPricing[], duration: number) {
  const exactMatch = pricing.find(item => item.duration === duration)
  if (exactMatch)
    return exactMatch
  return [...pricing].sort((a, b) => Math.abs(a.duration - duration) - Math.abs(b.duration - duration))[0]
}

function getVideoModelsCredits(
  models: VideoModelInfo[],
  resolution: string,
  isVideoEditMode: boolean,
  duration: number,
  quantity: number,
) {
  const total = models.reduce((sum, model) => {
    const pricing = filterVideoPricingByResolution(model.pricing, resolution, isVideoEditMode)
    return sum + (getNearestVideoPricing(pricing, duration)?.price ?? 0)
  }, 0)
  return Math.ceil(total * quantity * 100) / 100
}

function buildAggregateImagePricing(models: ImageModelInfo[]) {
  const commonResolutions = getImageModelsCommonResolutions(models)
  return commonResolutions.map(resolution => ({
    resolution,
    pricePerImage: Math.ceil(models.reduce((sum, model) => {
      return sum + (model.pricing.find(item => item.resolution === resolution)?.pricePerImage ?? 0)
    }, 0) * 100) / 100,
  }))
}

/** youmind.com URL 语言路径映射：英语等无前缀，日语/韩语使用不同代码 */
const PROMPTS_EXPLORE_LNG_MAP: Record<string, string> = {
  'zh-CN': 'zh-CN',
  'ja': 'ja-JP',
  'ko': 'ko-KR',
}

const DEFAULT_PROMPTS_EXPLORE_SLUG = 'grok-imagine-prompts'
const SEEDANCE_PROMPTS_EXPLORE_SLUG = 'seedance-2-0-prompts'

function getPromptsExploreSlugByModel(modelName?: string) {
  if (modelName && /seedance/i.test(modelName))
    return SEEDANCE_PROMPTS_EXPLORE_SLUG
  return DEFAULT_PROMPTS_EXPLORE_SLUG
}

export interface BrandImage {
  id: string
  url: string
}

interface BrandInfoLite {
  id: string
  name?: string
  status?: string
  contact?: {
    address?: string
  }
  imageList?: BrandImage[]
}

function getOpenSourceBrandInfo(): BrandInfoLite | null {
  return null
}

/** 模块级常量，避免 selector 每次返回新引用导致无限重渲染 */
const EMPTY_IMAGE_LIST: BrandImage[] = []

interface AiBatchGenerateBarProps {
  /** 外部传入 groupId，不从 store 读取 */
  groupId?: string
  /** 生成成功后回调 */
  onGenerated?: () => void
  /** 自定义容器类名 */
  className?: string
  /** 是否显示品牌信息栏 */
  showBrandInfo?: boolean
  /** 是否强制使用草稿模式，隐藏独立图片/视频生成 */
  forceDraftMode?: boolean
}

const AiBatchGenerateBar = memo(({ groupId, onGenerated, className, forceDraftMode = false }: AiBatchGenerateBarProps) => {
  const { t } = useTransClient('brandPromotion')
  const lng = useGetClientLng()

  // 品牌信息（按 groupId）
  const brandInfo = getOpenSourceBrandInfo()
  const imageList = brandInfo?.imageList ?? EMPTY_IMAGE_LIST

  // 配置 key：按 groupId 隔离
  const configKey = groupId || '__default__'

  // Store：按草稿箱隔离的持久化配置
  const { configSnapshot, getConfig, updateConfig, _hasHydrated } = useDraftBoxConfigStore(useShallow(state => ({
    configSnapshot: state.configs[configKey],
    getConfig: state.getConfig,
    updateConfig: state.updateConfig,
    _hasHydrated: state._hasHydrated,
  })))

  const config = configSnapshot ?? getConfig(configKey)

  // Store：生成状态
  const {
    isGeneratingBatch,
    createBatchGenerationWithModels,
    createImageTextBatchGenerationWithModels,
  } = usePlanDetailStore(useShallow(state => ({
    isGeneratingBatch: state.isGeneratingBatch,
    createBatchGenerationWithModels: state.createBatchGenerationWithModels,
    createImageTextBatchGenerationWithModels: state.createImageTextBatchGenerationWithModels,
  })))

  // 默认提示词（基于品牌名称和位置）
  const defaultPrompt = useMemo(() => {
    if (!brandInfo?.name)
      return ''
    const position = brandInfo.contact?.address
    if (position) {
      return t('detail.defaultPrompt', { name: brandInfo.name, position })
    }
    return t('detail.defaultPromptNoPosition', { name: brandInfo.name })
  }, [brandInfo?.name, brandInfo?.contact?.address, t])

  // 拖拽状态
  const [isDragging, setIsDragging] = useState(false)
  const dragCountRef = useRef(0)

  // 本地状态（从 config 初始化）
  const [promptValue, setPromptValue] = useState('')
  const [promptEditorOpen, setPromptEditorOpen] = useState(false)
  const [visionPromptLoading, setVisionPromptLoading] = useState(false)
  const [visionRun, setVisionRun] = useState<VisionRunState>(IDLE_VISION_STATE)
  const visionAbortRef = useRef<AbortController | null>(null)
  const visionDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 3-shot BOARD-style I2V + stitch (9:16) — slower, better narrative than single clip */
  const [storyboardMode, setStoryboardMode] = useState(false)
  const [bugsellPickerOpen, setBugsellPickerOpen] = useState(false)
  const [bugsellProduct, setBugsellProduct] = useState<ProductPickerSelection | null>(null)

  // Warm BugSell catalog in the background so opening the sheet is near-instant
  useEffect(() => {
    const t = window.setTimeout(() => prefetchBugSellCatalog(), 800)
    return () => window.clearTimeout(t)
  }, [])
  /** Default true with product photo: server matches source aspect (no pad). User aspect pick → false (force pad path). */
  const [matchSourceAspect, setMatchSourceAspect] = useState(true)
  const [aspectRatio, setAspectRatio] = useState(config.aspectRatio)
  const [duration, setDuration] = useState(config.duration)
  const [resolution, setResolution] = useState(config.resolution)
  const [modelType, setModelType] = useState<VideoModelType>(config.modelType)
  const [modelSelectionMode, setModelSelectionMode] = useState<ModelSelectionMode>('single')
  const [selectedVideoModels, setSelectedVideoModels] = useState<VideoModelType[]>(
    applyModelSelectionMode(config.selectedVideoModels.length > 0 ? config.selectedVideoModels : (config.modelType ? [config.modelType] : []), 'single'),
  )
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [contentType, setContentType] = useState<DraftContentType>(config.contentType)
  const [imageModel, setImageModel] = useState<string>(config.imageModel)
  const [selectedImageModels, setSelectedImageModels] = useState<string[]>(
    applyModelSelectionMode(config.selectedImageModels.length > 0 ? config.selectedImageModels : (config.imageModel ? [config.imageModel] : []), 'single'),
  )
  const [imageCount, setImageCount] = useState(config.imageCount)
  const [imageSize, setImageSize] = useState(config.imageSize)
  const [quantity, setQuantity] = useState(config.quantity)
  const [isDraftMode, setIsDraftMode] = useState(forceDraftMode ? true : config.isDraftMode ?? true)
  const [captionPrompt, setCaptionPrompt] = useState(config.captionPrompt ?? '')
  const [captionSystemPrompt, setCaptionSystemPrompt] = useState(config.captionSystemPrompt ?? '')
  const [captionSystemPromptDefault, setCaptionSystemPromptDefault] = useState(config.captionSystemPromptDefault ?? '')
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(config.captionPromptOpen ?? true)
  // 计算可用平台
  const availablePlatforms = useMemo(() =>
    TaskPlatInfoArr.map(([plat]) => plat), [])

  const accountList = useAccountStore(state => state.accountList)
  const connectedPlatforms = useMemo(() => getConnectedPlatforms(accountList), [accountList])

  const [platformPreset, setPlatformPreset] = useState<'connected' | 'all' | 'custom'>(
    () => config.platformPreset || 'connected',
  )

  // 初始化 selectedPlatforms：默认 Connected channels
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatType[]>(() => {
    const preset = config.platformPreset || 'connected'
    if (preset === 'custom' && config.selectedPlatforms.length > 0) {
      return config.selectedPlatforms.filter(p => AccountPlatInfoMap.has(p) && !TASK_EXCLUDED_PLATFORMS.has(p))
    }
    return resolvePlatformsByPreset(preset, accountList, config.selectedPlatforms)
  })

  // 用 ref 追踪是否已完成初始自动选中
  const initialSelectionDone = useRef(false)
  // 组合输入期间避免被 store 回刷打断 IME
  const isPromptComposingRef = useRef(false)
  const promptValueRef = useRef(promptValue)
  const captionPromptRef = useRef(captionPrompt)
  const captionSystemPromptRef = useRef(captionSystemPrompt)
  const captionSystemPromptDefaultRef = useRef(captionSystemPromptDefault)
  // 追踪上一次的 configKey，用于同步 effect 检测切换
  const prevConfigKeyRef = useRef(configKey)
  const isMediaInitializedRef = useRef(false)
  // 防止同一品牌 ID 重复应用默认值
  const lastAppliedBrandIdRef = useRef<string | null>(null)

  promptValueRef.current = promptValue
  captionPromptRef.current = captionPrompt
  captionSystemPromptRef.current = captionSystemPrompt
  captionSystemPromptDefaultRef.current = captionSystemPromptDefault

  // Pricing 数据
  const { pricingData, isLoading: isPricingLoading } = usePricingData()

  // 派生：图文模型选项列表
  const imageModelOptions = useMemo(() => {
    if (!pricingData?.imageModels)
      return []
    return pricingData.imageModels.map(m => ({
      value: m.model,
      label: m.displayName,
      tags: m.tags ?? [],
    }))
  }, [pricingData])

  // 派生：当前选中图文模型的信息列表
  const selectedImageModelInfos: ImageModelInfo[] = useMemo(() => {
    if (!pricingData?.imageModels)
      return []
    return selectedImageModels
      .map(model => pricingData.imageModels.find(item => item.model === model))
      .filter((model): model is ImageModelInfo => Boolean(model))
  }, [pricingData, selectedImageModels])

  // 派生：当前多模型公共分辨率的合计定价列表
  const imagePricing: ImageModelPricing[] = useMemo(() => {
    return buildAggregateImagePricing(selectedImageModelInfos)
  }, [selectedImageModelInfos])

  // 派生：当前图文模型公共支持的比例
  const currentImageAspectRatios = useMemo(() => {
    return selectedImageModelInfos.length > 0
      ? getImageModelsCommonAspectRatios(selectedImageModelInfos)
      : []
  }, [selectedImageModelInfos])

  const currentImageMaxInputImages = useMemo(() => {
    return getImageModelsMaxInputImages(selectedImageModelInfos)
  }, [selectedImageModelInfos])

  // ==================== 视频模型派生数据（不依赖 hasVideos 的部分） ====================

  // 派生：视频模型选项列表（从 API 数据）
  const videoModelOptions = useMemo(() => {
    if (!pricingData?.videoModels)
      return []
    return pricingData.videoModels.map(m => ({ value: m.name, label: m.description || m.name }))
  }, [pricingData])

  // 派生：当前选中视频模型的完整信息列表
  const selectedVideoModelInfos: VideoModelInfo[] = useMemo(() => {
    if (!pricingData?.videoModels)
      return []
    return selectedVideoModels
      .map(model => pricingData.videoModels?.find(item => item.name === model))
      .filter((model): model is VideoModelInfo => Boolean(model))
  }, [pricingData, selectedVideoModels])

  const currentVideoModelInfo = selectedVideoModelInfos[0]

  // 派生：当前视频模型公共配置（从 API 数据计算）
  const currentVideoModelConfig = useMemo(() => {
    if (selectedVideoModelInfos.length > 0)
      return getVideoModelsCommonStaticConfig(selectedVideoModelInfos)
    const fallbackModelType = modelType || pricingData?.videoModels?.[0]?.name || ''
    return getVideoModelStaticConfig(fallbackModelType, pricingData?.videoModels)
  }, [modelType, pricingData?.videoModels, selectedVideoModelInfos])

  const currentVideoResolutions = useMemo(() => {
    if (selectedVideoModelInfos.length > 0)
      return getVideoModelsCommonResolutions(selectedVideoModelInfos)
    return getVideoModelResolutions(currentVideoModelInfo)
  }, [currentVideoModelInfo, selectedVideoModelInfos])

  const defaultVideoResolution = useMemo(() => {
    return currentVideoResolutions[0] ?? getVideoModelDefaultResolution(currentVideoModelInfo)
  }, [currentVideoModelInfo, currentVideoResolutions])

  // pricing 加载后校验图文模型是否可用
  useEffect(() => {
    if (!pricingData?.imageModels?.length)
      return

    const availableModels = pricingData.imageModels.map(model => model.model)
    const nextSelectedModels = applyModelSelectionMode(normalizeSelectedValues(selectedImageModels, availableModels, imageModel), modelSelectionMode)
    const nextPrimaryModel = nextSelectedModels[0] ?? ''
    const nextModelInfos = nextSelectedModels
      .map(model => pricingData.imageModels.find(item => item.model === model))
      .filter((model): model is ImageModelInfo => Boolean(model))
    const nextPricing = buildAggregateImagePricing(nextModelInfos)
    const nextRatios = getImageModelsCommonAspectRatios(nextModelInfos)

    if (!isEqual(nextSelectedModels, selectedImageModels)) {
      setSelectedImageModels(nextSelectedModels)
      updateConfig(configKey, { selectedImageModels: nextSelectedModels })
    }

    if (nextPrimaryModel && nextPrimaryModel !== imageModel) {
      setImageModel(nextPrimaryModel)
      updateConfig(configKey, { imageModel: nextPrimaryModel })
    }

    // 校验 imageSize 是否在当前模型定价中
    if (nextPricing.length > 0 && !includesOption(nextPricing.map(p => p.resolution), imageSize)) {
      const firstSize = nextPricing[0]?.resolution ?? '1K'
      setImageSize(firstSize)
      updateConfig(configKey, { imageSize: firstSize })
    }
    // 图文模式下校验比例是否在当前图片模型支持范围内
    if (contentType === 'image_text') {
      if (nextRatios.length > 0 && !includesOption(nextRatios, aspectRatio)) {
        const firstRatio = nextRatios[0] ?? '1:1'
        setAspectRatio(firstRatio)
        updateConfig(configKey, { aspectRatio: firstRatio })
      }
    }
  }, [pricingData, selectedImageModels, imageModel, imageSize, contentType, aspectRatio, configKey, updateConfig])

  // pricing 加载后校验视频模型与分辨率是否可用
  useEffect(() => {
    if (!pricingData?.videoModels?.length)
      return

    const availableModels = pricingData.videoModels.map(model => model.name)
    const nextSelectedModels = applyModelSelectionMode(normalizeSelectedValues(selectedVideoModels, availableModels, modelType), modelSelectionMode)
    const nextPrimaryModel = nextSelectedModels[0] ?? ''
    const nextModelInfos = nextSelectedModels
      .map(model => pricingData.videoModels?.find(item => item.name === model))
      .filter((model): model is VideoModelInfo => Boolean(model))
    const nextResolutions = getVideoModelsCommonResolutions(nextModelInfos)
    const nextConfig = getVideoModelsCommonStaticConfig(nextModelInfos)

    if (!isEqual(nextSelectedModels, selectedVideoModels)) {
      setSelectedVideoModels(nextSelectedModels)
      updateConfig(configKey, { selectedVideoModels: nextSelectedModels })
    }

    if (nextPrimaryModel && nextPrimaryModel !== modelType) {
      setModelType(nextPrimaryModel)
      updateConfig(configKey, { modelType: nextPrimaryModel })
    }

    if (nextResolutions.length > 0 && !includesOption(nextResolutions, resolution)) {
      const nextResolution = nextResolutions[0] ?? getVideoModelDefaultResolution(nextModelInfos[0])
      setResolution(nextResolution)
      updateConfig(configKey, { resolution: nextResolution })
    }

    if (contentType === 'video' && nextConfig.supportedRatios.size > 0 && !includesOption([...nextConfig.supportedRatios], aspectRatio)) {
      const nextRatio = nextConfig.supportedRatios.has('9:16')
        ? '9:16'
        : ([...nextConfig.supportedRatios][0] ?? '9:16')
      setAspectRatio(nextRatio)
      updateConfig(configKey, { aspectRatio: nextRatio })
    }
  }, [pricingData, selectedVideoModels, modelType, resolution, contentType, aspectRatio, configKey, updateConfig])

  // 旧用户数据迁移：jimeng/grok → 第一个可用视频模型
  useEffect(() => {
    if (config.modelType === 'jimeng' || config.modelType === 'grok') {
      const fallback = pricingData?.videoModels?.[0]?.name ?? ('' as VideoModelType)
      updateConfig(configKey, { modelType: fallback })
      setModelType(fallback)
      setSelectedVideoModels(fallback ? [fallback] : [])
      updateConfig(configKey, { selectedVideoModels: fallback ? [fallback] : [] })
    }
  }, [pricingData, config.modelType])

  // 默认提示词自动填充
  const defaultPromptFilledRef = useRef(false)
  useEffect(() => {
    if (defaultPrompt && !defaultPromptFilledRef.current && !promptValue) {
      setPromptValue(defaultPrompt)
      updateConfig(configKey, { promptValue: defaultPrompt })
      defaultPromptFilledRef.current = true
    }
  }, [defaultPrompt, promptValue])

  // 品牌切换后强制应用默认提示词和图片
  const applyBrandDefaults = useCallback(() => {
    if (!brandInfo?.id)
      return
    // 设置提示词
    if (defaultPrompt) {
      setPromptValue(defaultPrompt)
      updateConfig(configKey, { promptValue: defaultPrompt })
      defaultPromptFilledRef.current = true
    }
    // 设置默认图片
    const currentImageList = brandInfo.imageList ?? []
    if (currentImageList.length > 0) {
      const maxImages = contentType === 'image_text'
        ? currentImageMaxInputImages
        : currentVideoModelConfig.maxImages
      const defaultCount = Math.min(5, maxImages, currentImageList.length)
      const defaultIds = currentImageList.slice(0, defaultCount).map(img => img.id)
      setSelectedIds(defaultIds)
      updateConfig(configKey, { selectedImageIds: defaultIds })
      initialSelectionDone.current = true
    }
    // 更新持久化的品牌 ID
    updateConfig(configKey, { linkedBrandId: brandInfo.id })
    lastAppliedBrandIdRef.current = brandInfo.id
  }, [brandInfo?.id, brandInfo?.imageList, defaultPrompt, configKey, updateConfig, contentType, currentImageMaxInputImages, currentVideoModelConfig])

  // 品牌就绪后自动应用默认提示词和图片
  useEffect(() => {
    if (!_hasHydrated || !brandInfo?.id || brandInfo.status !== 'active')
      return
    if (lastAppliedBrandIdRef.current === brandInfo.id)
      return

    const storedBrandId = getConfig(configKey).linkedBrandId
    if (storedBrandId === brandInfo.id) {
      // 品牌未变，仅标记
      lastAppliedBrandIdRef.current = brandInfo.id
      return
    }

    // 品牌已变更，应用默认值
    applyBrandDefaults()
  }, [brandInfo?.id, brandInfo?.status, _hasHydrated, configKey, getConfig, applyBrandDefaults])

  // imageList 异步加载后自动选中默认图片
  useEffect(() => {
    if (!initialSelectionDone.current && imageList.length > 0) {
      const maxImages = contentType === 'image_text'
        ? currentImageMaxInputImages
        : currentVideoModelConfig.maxImages
      const defaultCount = Math.min(5, maxImages, imageList.length)
      const defaultIds = imageList.slice(0, defaultCount).map(img => img.id)
      setSelectedIds(defaultIds)
      updateConfig(configKey, { selectedImageIds: defaultIds })
      initialSelectionDone.current = true
    }
  }, [imageList, modelType, contentType, imageModel, configKey, updateConfig, currentImageMaxInputImages, currentVideoModelConfig])

  // 本地上传媒体
  const {
    medias: localMedias,
    setMedias,
    isUploading,
    handleMediasChange: uploadMedias,
    handleMediaRemove: removeLocalMedia,
    clearMedias,
  } = useMediaUpload()
  const localMediasRef = useRef<IUploadedMedia[]>(localMedias)
  localMediasRef.current = localMedias

  // 包装删除：同步清理 videoDurationMapRef
  const handleLocalMediaRemove = useCallback((index: number) => {
    const media = localMedias[index]
    if (media?.type === 'video' && media.file) {
      videoDurationMapRef.current.delete(media.file.name + media.file.size)
    }
    removeLocalMedia(index)
  }, [localMedias, removeLocalMedia])

  // 上传完成后自动同步媒体到 store 持久化
  useEffect(() => {
    // 守卫 1：hydration 完成前不同步，防止空 medias 覆写 IndexedDB 数据
    if (!_hasHydrated)
      return
    // 守卫 2：configKey 刚变化时跳过，此时 localMedias 还是旧草稿箱的数据
    if (prevConfigKeyRef.current !== configKey) {
      prevConfigKeyRef.current = configKey
      isMediaInitializedRef.current = false
      return
    }
    // 守卫 3：媒体尚未从 store 恢复前不同步，防止空 localMedias 覆写持久化数据
    if (!isMediaInitializedRef.current)
      return
    const completed: IPersistedMedia[] = localMedias
      .filter(m => m.url && m.progress === undefined)
      .map(m => ({
        id: m.id!,
        url: m.url,
        type: m.type as 'image' | 'video',
        name: m.name,
        duration: m.type === 'video' && m.id ? videoDurationMapRef.current.get(m.id) : undefined,
      }))
    const storedPersistedMedias = getConfig(configKey).persistedMedias ?? []
    if (buildPersistedMediaSignature(storedPersistedMedias) === buildPersistedMediaSignature(completed)) {
      return
    }
    updateConfig(configKey, { persistedMedias: completed })
  }, [localMedias, configKey, getConfig, updateConfig, _hasHydrated])

  // 派生
  const localImages = useMemo(() => localMedias.filter(m => m.type === 'image'), [localMedias])
  const localVideos = useMemo(() => localMedias.filter(m => m.type === 'video'), [localMedias])
  const hasVideos = useMemo(() => localVideos.some(v => v.url), [localVideos])

  // ==================== 视频模型派生数据（依赖 hasVideos） ====================

  // 是否为视频编辑模式（上传了视频 + 视频内容类型）
  const isVideoEditMode = hasVideos && contentType === 'video'

  // 图文非草稿模式不展示数量控件，提交时固定为 1，避免与草稿模式 quantity 串用
  const effectiveQuantity = useMemo(() => {
    if (contentType === 'image_text' && !isDraftMode)
      return 1
    return quantity
  }, [contentType, isDraftMode, quantity])

  // 派生：从 pricing 数据的 duration 范围派生时长限制
  const videoDurationLimits = useMemo(() => {
    return getVideoDurationLimits(selectedVideoModelInfos, resolution, isVideoEditMode)
  }, [selectedVideoModelInfos, resolution, isVideoEditMode])

  // 派生：按 duration 查表得到价格 × quantity
  const videoCredits = useMemo(() => {
    return getVideoModelsCredits(selectedVideoModelInfos, resolution, isVideoEditMode, duration, effectiveQuantity)
  }, [selectedVideoModelInfos, resolution, isVideoEditMode, duration, effectiveQuantity])

  const imageTextCredits = useMemo(() => {
    const currentPricing = imagePricing.find(p => p.resolution === imageSize)
    const pricePerImage = currentPricing?.pricePerImage ?? 0
    return Math.ceil(pricePerImage * imageCount * effectiveQuantity * 100) / 100
  }, [effectiveQuantity, imageCount, imagePricing, imageSize])

  const totalCredits = contentType === 'video' ? videoCredits : imageTextCredits

  // hasVideos 变化时自动 clamp duration（video2video 最大 duration 可能更小）
  useEffect(() => {
    if (contentType !== 'video')
      return
    if (duration > videoDurationLimits.max) {
      setDuration(videoDurationLimits.max)
      updateConfig(configKey, { duration: videoDurationLimits.max })
    }
    else if (duration < videoDurationLimits.min) {
      setDuration(videoDurationLimits.min)
      updateConfig(configKey, { duration: videoDurationLimits.min })
    }
  }, [videoDurationLimits, contentType])

  // 视频时长追踪
  const videoDurationMapRef = useRef<Map<string, number>>(new Map())

  // 视频编辑模式：输入视频总时长（用于锁定 duration）
  const inputVideoDuration = useMemo(() => {
    if (!isVideoEditMode)
      return null
    let total = 0
    videoDurationMapRef.current.forEach(d => total += d)
    return Math.round(total)
  }, [isVideoEditMode, localVideos])

  // 视频编辑模式：自动将 duration 设为输入视频总时长
  useEffect(() => {
    if (inputVideoDuration !== null && inputVideoDuration !== duration) {
      setDuration(inputVideoDuration)
      updateConfig(configKey, { duration: inputVideoDuration })
    }
  }, [inputVideoDuration])

  // configKey 变化时（切换草稿箱），同步本地状态到新 config
  useEffect(() => {
    if (!_hasHydrated)
      return // 等待 IndexedDB 恢复完成

    const newConfig = getConfig(configKey)
    setAspectRatio(newConfig.aspectRatio)
    setDuration(newConfig.duration)
    setResolution(newConfig.resolution)
    setModelType(newConfig.modelType)
    setSelectedVideoModels(newConfig.selectedVideoModels.length > 0
      ? newConfig.selectedVideoModels
      : (newConfig.modelType ? [newConfig.modelType] : []))
    setContentType(newConfig.contentType)
    setImageModel(newConfig.imageModel)
    setSelectedImageModels(newConfig.selectedImageModels.length > 0
      ? newConfig.selectedImageModels
      : (newConfig.imageModel ? [newConfig.imageModel] : []))
    setImageCount(newConfig.imageCount)
    setImageSize(newConfig.imageSize)
    setQuantity(newConfig.quantity)
    setIsDraftMode(forceDraftMode ? true : newConfig.isDraftMode ?? true)
    setCaptionPrompt(newConfig.captionPrompt ?? '')
    setCaptionSystemPrompt(newConfig.captionSystemPrompt ?? '')
    setCaptionSystemPromptDefault(newConfig.captionSystemPromptDefault ?? '')
    setMoreOptionsOpen(newConfig.captionPromptOpen ?? true)
    // selectedPlatforms 需要过滤不可用平台 + 空时默认全选
    const storedPlatforms = newConfig.selectedPlatforms
    if (storedPlatforms.length === 0) {
      setSelectedPlatforms(availablePlatforms)
    }
    else {
      setSelectedPlatforms(storedPlatforms.filter(p => AccountPlatInfoMap.has(p) && !TASK_EXCLUDED_PLATFORMS.has(p)))
    }
    // 品牌匹配判断：如果品牌已变更，不恢复旧的 prompt 和 imageIds
    const brandChanged = brandInfo?.id && brandInfo.status === 'active' && newConfig.linkedBrandId !== brandInfo.id
    if (brandChanged) {
      // 品牌已变更，重置 ref 标志，让品牌变化 effect 处理
      setPromptValue('')
      defaultPromptFilledRef.current = false
      setSelectedIds([])
      initialSelectionDone.current = false
      lastAppliedBrandIdRef.current = null
    }
    else {
      // 从 store 恢复描述
      const storedPrompt = newConfig.promptValue ?? ''
      setPromptValue(storedPrompt)
      defaultPromptFilledRef.current = !!storedPrompt
      // 从 store 恢复品牌图片选择
      const storedImageIds = newConfig.selectedImageIds ?? []
      if (storedImageIds.length > 0) {
        setSelectedIds(storedImageIds)
        initialSelectionDone.current = true
      }
      else {
        setSelectedIds([])
        initialSelectionDone.current = false
      }
      lastAppliedBrandIdRef.current = newConfig.linkedBrandId || null
    }
    // 从 store 恢复持久化的媒体
    const persistedMedias = newConfig.persistedMedias ?? []
    if (persistedMedias.length > 0) {
      setMedias(persistedMedias.map(m => ({
        id: m.id,
        url: m.url,
        type: m.type,
        name: m.name,
      })))
      // 恢复视频时长 map
      videoDurationMapRef.current.clear()
      persistedMedias
        .filter(m => m.type === 'video' && m.duration)
        .forEach(m => videoDurationMapRef.current.set(m.id, m.duration!))
    }
    else {
      clearMedias()
      videoDurationMapRef.current.clear()
    }
    isMediaInitializedRef.current = true
  }, [configKey, _hasHydrated, forceDraftMode])

  useEffect(() => {
    if (!forceDraftMode || !_hasHydrated)
      return
    setIsDraftMode(true)
    updateConfig(configKey, { isDraftMode: true })
  }, [_hasHydrated, configKey, forceDraftMode, updateConfig])

  // 响应外部对 persistedMedias 的追加（例如图片资源卡片一键添加到参考文件）
  useEffect(() => {
    if (!_hasHydrated || !isMediaInitializedRef.current) {
      return
    }

    const persistedMedias = config.persistedMedias ?? []
    const currentLocalMedias = localMediasRef.current
    const uploadingMedias = currentLocalMedias.filter(media => media.progress !== undefined)
    const completedLocalMedias = currentLocalMedias
      .filter(media => media.url && media.progress === undefined)
      .map(media => ({
        id: media.id ?? '',
        url: media.url,
        type: media.type === 'video' ? 'video' as const : 'image' as const,
        name: media.name,
        duration: media.type === 'video' && media.id
          ? videoDurationMapRef.current.get(media.id)
          : undefined,
      }))

    if (buildPersistedMediaSignature(persistedMedias) === buildPersistedMediaSignature(completedLocalMedias)) {
      return
    }

    setMedias([
      ...persistedMedias.map(media => ({
        id: media.id,
        url: media.url,
        type: media.type,
        name: media.name,
      })),
      ...uploadingMedias,
    ])

    const nextVideoDurationMap = new Map<string, number>()
    uploadingMedias.forEach((media) => {
      if (media.type !== 'video' || !media.file) {
        return
      }

      const cacheKey = media.file.name + media.file.size
      const cachedDuration = videoDurationMapRef.current.get(cacheKey)
      if (cachedDuration !== undefined) {
        nextVideoDurationMap.set(cacheKey, cachedDuration)
      }
    })
    persistedMedias
      .filter(media => media.type === 'video' && media.duration)
      .forEach(media => nextVideoDurationMap.set(media.id, media.duration!))

    videoDurationMapRef.current.clear()
    nextVideoDurationMap.forEach((duration, key) => {
      videoDurationMapRef.current.set(key, duration)
    })
  }, [config.persistedMedias, setMedias, _hasHydrated])

  // 响应外部对当前草稿箱配置的回填，例如历史参数的一键使用
  useEffect(() => {
    if (!_hasHydrated || !configSnapshot || isPromptComposingRef.current) {
      return
    }

    const nextPromptValue = configSnapshot.promptValue ?? ''
    if (nextPromptValue !== promptValueRef.current) {
      setPromptValue(nextPromptValue)
      defaultPromptFilledRef.current = !!nextPromptValue
    }
  }, [_hasHydrated, configSnapshot?.promptValue])

  useEffect(() => {
    if (!_hasHydrated || !configSnapshot) {
      return
    }

    const nextCaptionPrompt = configSnapshot.captionPrompt ?? ''
    if (nextCaptionPrompt !== captionPromptRef.current) {
      setCaptionPrompt(nextCaptionPrompt)
    }
  }, [_hasHydrated, configSnapshot?.captionPrompt])

  useEffect(() => {
    if (!_hasHydrated || !configSnapshot) {
      return
    }

    const nextCaptionSystemPrompt = configSnapshot.captionSystemPrompt ?? ''
    if (nextCaptionSystemPrompt !== captionSystemPromptRef.current) {
      setCaptionSystemPrompt(nextCaptionSystemPrompt)
    }
  }, [_hasHydrated, configSnapshot?.captionSystemPrompt])

  useEffect(() => {
    if (!_hasHydrated || !configSnapshot) {
      return
    }

    const nextCaptionSystemPromptDefault = configSnapshot.captionSystemPromptDefault ?? ''
    if (nextCaptionSystemPromptDefault !== captionSystemPromptDefaultRef.current) {
      setCaptionSystemPromptDefault(nextCaptionSystemPromptDefault)
    }
  }, [_hasHydrated, configSnapshot?.captionSystemPromptDefault])

  useEffect(() => {
    if (!_hasHydrated || !configSnapshot) {
      return
    }

    if (configSnapshot.aspectRatio !== aspectRatio) {
      setAspectRatio(configSnapshot.aspectRatio)
    }
    if (configSnapshot.duration !== duration) {
      setDuration(configSnapshot.duration)
    }
    if (configSnapshot.resolution !== resolution) {
      setResolution(configSnapshot.resolution)
    }
    if (configSnapshot.modelType !== modelType) {
      setModelType(configSnapshot.modelType)
    }
    const nextSelectedVideoModels = applyModelSelectionMode(
      configSnapshot.selectedVideoModels.length > 0
        ? configSnapshot.selectedVideoModels
        : (configSnapshot.modelType ? [configSnapshot.modelType] : []),
      modelSelectionMode,
    )
    if (!isEqual(nextSelectedVideoModels, selectedVideoModels)) {
      setSelectedVideoModels(nextSelectedVideoModels)
    }
    if (configSnapshot.contentType !== contentType) {
      setContentType(configSnapshot.contentType)
    }
    if (configSnapshot.imageModel !== imageModel) {
      setImageModel(configSnapshot.imageModel)
    }
    const nextSelectedImageModels = applyModelSelectionMode(
      configSnapshot.selectedImageModels.length > 0
        ? configSnapshot.selectedImageModels
        : (configSnapshot.imageModel ? [configSnapshot.imageModel] : []),
      modelSelectionMode,
    )
    if (!isEqual(nextSelectedImageModels, selectedImageModels)) {
      setSelectedImageModels(nextSelectedImageModels)
    }
    if (configSnapshot.imageCount !== imageCount) {
      setImageCount(configSnapshot.imageCount)
    }
    if (configSnapshot.imageSize !== imageSize) {
      setImageSize(configSnapshot.imageSize)
    }
    if (configSnapshot.quantity !== quantity) {
      setQuantity(configSnapshot.quantity)
    }

    const nextIsDraftMode = forceDraftMode ? true : configSnapshot.isDraftMode ?? true
    if (nextIsDraftMode !== isDraftMode) {
      setIsDraftMode(nextIsDraftMode)
    }

    const nextCaptionPromptOpen = configSnapshot.captionPromptOpen ?? true
    if (nextCaptionPromptOpen !== moreOptionsOpen) {
      setMoreOptionsOpen(nextCaptionPromptOpen)
    }

    const nextPreset = configSnapshot.platformPreset || 'connected'
    if (nextPreset !== platformPreset)
      setPlatformPreset(nextPreset)

    const nextSelectedPlatforms = resolvePlatformsByPreset(
      nextPreset,
      accountList,
      configSnapshot.selectedPlatforms,
    )

    if (!isEqual(nextSelectedPlatforms, selectedPlatforms)) {
      setSelectedPlatforms(nextSelectedPlatforms)
    }

    const nextSelectedIds = configSnapshot.selectedImageIds ?? []
    if (!isEqual(nextSelectedIds, selectedIds)) {
      setSelectedIds(nextSelectedIds)
      initialSelectionDone.current = nextSelectedIds.length > 0
    }
  }, [
    _hasHydrated,
    configSnapshot,
    aspectRatio,
    duration,
    resolution,
    modelType,
    selectedVideoModels,
    contentType,
    imageModel,
    selectedImageModels,
    imageCount,
    imageSize,
    quantity,
    isDraftMode,
    moreOptionsOpen,
    availablePlatforms,
    selectedPlatforms,
    selectedIds,
    forceDraftMode,
  ])

  // 已选图片对象
  const selectedImages = useMemo(() => {
    const imageMap = new Map(imageList.map(img => [img.id, img]))
    return selectedIds.map(id => imageMap.get(id)).filter(Boolean) as BrandImage[]
  }, [selectedIds, imageList])

  // Effective aspect for compatibility: when matching source, assume 1:1 risk for UI warnings
  // (real source often 1:1/4:3 catalog photos that fail IG Reels).
  const compatibilityAspect = useMemo(() => {
    if (contentType !== 'video')
      return aspectRatio
    if (matchSourceAspect)
      return '1:1' // worst-case for platform preflight while source-matched
    return aspectRatio
  }, [contentType, aspectRatio, matchSourceAspect])

  // 平台兼容性检查（preflight before gen）
  const incompatiblePlatforms = useMemo(() => {
    return checkPlatformCompatibility(
      { contentType, aspectRatio: compatibilityAspect, duration, imageCount },
      availablePlatforms,
      t,
    )
  }, [contentType, compatibilityAspect, duration, imageCount, availablePlatforms, t])

  // Keep all selected platforms for API — auto-fix aspect instead of silently dropping IG
  const effectiveSelectedPlatforms = useMemo(() =>
    selectedPlatforms.filter(p => {
      const reasons = incompatiblePlatforms.get(p)
      if (!reasons?.length)
        return true
      // Drop only hard content-type unsupported (e.g. YT for image_text)
      return !reasons.some(r => /content type|not supported|不支持/i.test(r) && !/aspect|ratio|时长|duration/i.test(r))
    }), [selectedPlatforms, incompatiblePlatforms])

  // Platforms change → fit aspect + duration to platform rules (IG Reels 4:5–9:16).
  useEffect(() => {
    if (contentType !== 'video')
      return
    const plats = selectedPlatforms.length ? selectedPlatforms : effectiveSelectedPlatforms
    if (!plats.length)
      return
    const preferred = matchSourceAspect ? '1:1' : aspectRatio
    const ready = resolvePublishReadyGenParams({
      platforms: plats,
      preferredAspect: preferred,
      preferredDuration: duration,
      modelRatios: [...currentVideoModelConfig.supportedRatios],
      modelDurationMin: videoDurationLimits.min,
      modelDurationMax: Math.min(videoDurationLimits.max, 15),
      forceSocialPortrait: false,
      fitPlatforms: true,
    })
    if (ready.aspectCorrected) {
      // Turn off source-match so gen uses pad path (never stretch)
      if (matchSourceAspect)
        setMatchSourceAspect(false)
      if (ready.aspectRatio !== aspectRatio) {
        setAspectRatio(ready.aspectRatio)
        updateConfig(configKey, { aspectRatio: ready.aspectRatio })
      }
    }
    if (ready.duration !== duration) {
      setDuration(ready.duration)
      updateConfig(configKey, { duration: ready.duration })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    contentType,
    selectedPlatforms.join(','),
    currentVideoModelConfig.supportedRatios,
    videoDurationLimits.min,
    videoDurationLimits.max,
    configKey,
  ])

  // 平台限制计算（基于有效平台）
  const effectiveLimitsDetailed: EffectiveLimitsDetailed = useMemo(() => {
    return calcEffectiveLimitsDetailed(effectiveSelectedPlatforms)
  }, [effectiveSelectedPlatforms])

  /** Banner before gen: platforms that would fail aspect with current / source-matched ratio */
  const platformAspectPreflight = useMemo(() => {
    if (contentType !== 'video' || selectedPlatforms.length === 0)
      return null as null | { aspect: string, notes: string[], blocked: Array<[string, string]> }
    const preferred = matchSourceAspect ? '1:1' : aspectRatio
    const ready = resolvePublishReadyGenParams({
      platforms: selectedPlatforms,
      preferredAspect: preferred,
      preferredDuration: duration,
      modelRatios: [...currentVideoModelConfig.supportedRatios],
      modelDurationMin: videoDurationLimits.min,
      modelDurationMax: Math.min(videoDurationLimits.max, 15),
      fitPlatforms: true,
    })
    const bad = checkPlatformCompatibility(
      {
        contentType: 'video',
        aspectRatio: ready.aspectRatio,
        duration: ready.duration,
        imageCount,
      },
      selectedPlatforms,
      t,
    )
    const blocked = [...bad.entries()]
      .filter(([, reasons]) => reasons.length > 0)
      .map(([plat, reasons]) => [String(plat), reasons[0]!] as [string, string])
    if (!ready.aspectCorrected && blocked.length === 0)
      return null
    return { aspect: ready.aspectRatio, notes: ready.notes, blocked }
  }, [
    contentType,
    selectedPlatforms,
    matchSourceAspect,
    aspectRatio,
    duration,
    currentVideoModelConfig.supportedRatios,
    videoDurationLimits.min,
    videoDurationLimits.max,
    imageCount,
    t,
  ])

  const defaultCaptionSystemPrompt = useMemo(() => {
    if (!isDraftMode)
      return ''

    const limits: string[] = []
    if (effectiveLimitsDetailed.titleMax) {
      limits.push(t('detail.titleLimitPrompt', { max: effectiveLimitsDetailed.titleMax.value }))
    }
    if (effectiveLimitsDetailed.desMax) {
      limits.push(t('detail.descriptionLimitPrompt', { max: effectiveLimitsDetailed.desMax.value }))
    }
    if (effectiveLimitsDetailed.topicMax) {
      limits.push(t('detail.topicLimitPrompt', { max: effectiveLimitsDetailed.topicMax.value }))
    }
    limits.push(t('detail.titleNoEmojiPrompt'))

    return buildDraftPromptLimitText(limits, {
      prefix: t('detail.systemCaptionPromptPrefix'),
      separator: t('detail.systemCaptionPromptSeparator'),
    })
  }, [effectiveLimitsDetailed, isDraftMode, t])

  useEffect(() => {
    if (!_hasHydrated || !isDraftMode)
      return

    if (captionSystemPromptDefault === defaultCaptionSystemPrompt) {
      return
    }

    setCaptionSystemPromptDefault(defaultCaptionSystemPrompt)
    setCaptionSystemPrompt(defaultCaptionSystemPrompt)
    updateConfig(configKey, {
      captionSystemPrompt: defaultCaptionSystemPrompt,
      captionSystemPromptDefault: defaultCaptionSystemPrompt,
    })
  }, [_hasHydrated, captionSystemPromptDefault, configKey, defaultCaptionSystemPrompt, isDraftMode, updateConfig])

  // 事件处理
  const handlePromptValueChange = useCallback((value: string, persist = true) => {
    setPromptValue(value)
    defaultPromptFilledRef.current = !!value
    if (persist) {
      updateConfig(configKey, { promptValue: value })
    }
  }, [configKey, updateConfig])

  const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    handlePromptValueChange(e.target.value, !isPromptComposingRef.current)
  }, [handlePromptValueChange])

  const handlePromptCompositionStart = useCallback(() => {
    isPromptComposingRef.current = true
  }, [])

  const handlePromptCompositionEnd = useCallback((e: React.CompositionEvent<HTMLTextAreaElement>) => {
    isPromptComposingRef.current = false
    handlePromptValueChange(e.currentTarget.value)
  }, [handlePromptValueChange])

  const handleImagesChange = useCallback((ids: string[]) => {
    setSelectedIds(ids)
    updateConfig(configKey, { selectedImageIds: ids })
  }, [configKey, updateConfig])

  const handleAspectRatioChange = useCallback((ratio: string) => {
    setAspectRatio(ratio)
    // Manual pick = force this aspect (letterbox pad if needed; never stretch)
    setMatchSourceAspect(false)
    updateConfig(configKey, { aspectRatio: ratio })
  }, [configKey, updateConfig])

  const handleContentTypeChange = useCallback((ct: DraftContentType) => {
    setContentType(ct)
    updateConfig(configKey, { contentType: ct })
    // 切换内容类型时校验并重置比例
    if (ct === 'image_text') {
      const supported = currentImageAspectRatios
      if (!includesOption(supported, aspectRatio)) {
        const defaultRatio = supported[0] ?? '1:1'
        setAspectRatio(defaultRatio)
        updateConfig(configKey, { aspectRatio: defaultRatio })
      }
    }
    else {
      const supported = currentVideoModelConfig.supportedRatios
      if (!includesOption([...supported], aspectRatio)) {
        const defaultRatio = supported.has('9:16') ? '9:16' : ([...supported][0] ?? '9:16')
        setAspectRatio(defaultRatio)
        updateConfig(configKey, { aspectRatio: defaultRatio })
      }
    }
    const maxImages = ct === 'image_text'
      ? currentImageMaxInputImages
      : currentVideoModelConfig.maxImages
    const maxVideos = ct === 'video' ? currentVideoModelConfig.maxVideos : 0
    const nextLocalImages = localMedias.filter(m => m.type === 'image')
    const nextLocalVideos = ct === 'video' ? localMedias.filter(m => m.type === 'video').slice(0, maxVideos) : []
    const nextLocalMediaIds = new Set([...nextLocalImages, ...nextLocalVideos].map(media => media.id))
    const allowedSelectedCount = Math.max(0, maxImages - nextLocalImages.length)
    const nextSelectedIds = selectedIds.slice(0, allowedSelectedCount)

    videoDurationMapRef.current.forEach((_, key) => {
      if (!nextLocalMediaIds.has(key))
        videoDurationMapRef.current.delete(key)
    })

    setMedias([...nextLocalImages, ...nextLocalVideos])
    setSelectedIds(nextSelectedIds)
    updateConfig(configKey, { selectedImageIds: nextSelectedIds })

    if (nextSelectedIds.length === 0 && nextLocalImages.length === 0 && imageList.length > 0 && maxImages > 0) {
      const defaultCount = Math.min(5, maxImages, imageList.length)
      const defaultIds = imageList.slice(0, defaultCount).map(img => img.id)
      setSelectedIds(defaultIds)
      updateConfig(configKey, { selectedImageIds: defaultIds })
    }
  }, [configKey, updateConfig, currentVideoModelConfig, currentImageMaxInputImages, currentImageAspectRatios, imageList, aspectRatio, localMedias, selectedIds, setMedias])

  const handleImageModelsChange = useCallback((models: string[]) => {
    if (models.length === 0)
      return

    const modelInfos = models
      .map(model => pricingData?.imageModels?.find(item => item.model === model))
      .filter((model): model is ImageModelInfo => Boolean(model))
    const commonRatios = getImageModelsCommonAspectRatios(modelInfos)
    const commonPricing = buildAggregateImagePricing(modelInfos)
    if (modelInfos.length !== models.length || commonRatios.length === 0 || commonPricing.length === 0) {
      toast.warning(t('detail.noCommonModelParams'))
      return
    }

    const nextPrimaryModel = models[0]!
    setSelectedImageModels(models)
    setImageModel(nextPrimaryModel)
    updateConfig(configKey, { selectedImageModels: models, imageModel: nextPrimaryModel })

    const maxImages = getImageModelsMaxInputImages(modelInfos)
    if (maxImages === 0) {
      setSelectedIds([])
      updateConfig(configKey, { selectedImageIds: [] })
      clearMedias()
    }
    else if (selectedIds.length > maxImages) {
      const trimmed = selectedIds.slice(0, maxImages)
      setSelectedIds(trimmed)
      updateConfig(configKey, { selectedImageIds: trimmed })
    }
    // 切换模型后校验 imageSize 是否在新模型定价中
    if (!includesOption(commonPricing.map(p => p.resolution), imageSize)) {
      const firstSize = commonPricing[0]?.resolution ?? '1K'
      setImageSize(firstSize)
      updateConfig(configKey, { imageSize: firstSize })
    }
    if (!includesOption(commonRatios, aspectRatio)) {
      const firstRatio = commonRatios[0] ?? '1:1'
      setAspectRatio(firstRatio)
      updateConfig(configKey, { aspectRatio: firstRatio })
    }
  }, [selectedIds.length, configKey, updateConfig, clearMedias, pricingData, imageSize, aspectRatio, t])

  const handleImageSizeChange = useCallback((size: string) => {
    setImageSize(size)
    updateConfig(configKey, { imageSize: size })
  }, [configKey, updateConfig])

  const handleImageCountChange = useCallback((count: number) => {
    setImageCount(count)
    updateConfig(configKey, { imageCount: count })
  }, [configKey, updateConfig])

  const handleDurationChange = useCallback((d: number) => {
    setDuration(d)
    updateConfig(configKey, { duration: d })
  }, [configKey, updateConfig])

  const handleResolutionChange = useCallback((nextResolution: string) => {
    setResolution(nextResolution)
    updateConfig(configKey, { resolution: nextResolution })
  }, [configKey, updateConfig])

  const handleQuantityChange = useCallback((q: number) => {
    setQuantity(q)
    updateConfig(configKey, { quantity: q })
  }, [configKey, updateConfig])

  const handleVideoModelsChange = useCallback((models: VideoModelType[]) => {
    if (models.length === 0)
      return

    const modelInfos = models
      .map(model => pricingData?.videoModels?.find(item => item.name === model))
      .filter((model): model is VideoModelInfo => Boolean(model))
    const newConfig = getVideoModelsCommonStaticConfig(modelInfos)
    const newResolutions = getVideoModelsCommonResolutions(modelInfos)
    if (modelInfos.length !== models.length || newConfig.supportedRatios.size === 0) {
      toast.warning(t('detail.noCommonModelParams'))
      return
    }

    if (localVideos.length > newConfig.maxVideos) {
      toast.warning(t('detail.videoCountExceeded', { max: newConfig.maxVideos }))
      return
    }

    const nextModelType = models[0]!
    const preferredResolution = models.length === 1
      ? getVideoModelDefaultResolution(modelInfos[0])
      : (newResolutions[0] ?? getVideoModelDefaultResolution(modelInfos[0]))
    const nextResolution = includesOption(newResolutions, preferredResolution)
      ? preferredResolution
      : (newResolutions[0] ?? preferredResolution)
    setSelectedVideoModels(models)
    setModelType(nextModelType)
    setResolution(nextResolution)
    updateConfig(configKey, { selectedVideoModels: models, modelType: nextModelType, resolution: nextResolution })
    const supported = newConfig.supportedRatios
    // 切换模型时默认选 9:16，不支持则选第一个可用比例
    if (!includesOption([...supported], aspectRatio)) {
      const defaultRatio = supported.has('9:16')
        ? '9:16'
        : ([...supported][0] ?? '9:16')
      setAspectRatio(defaultRatio)
      updateConfig(configKey, { aspectRatio: defaultRatio })
    }
    // 根据新模型的 maxImages 裁剪选中的图片（maxImages=0 时不 wipe — 曾误清 BugSell ref）
    const maxImages = newConfig.maxImages
    if (maxImages > 0) {
      const allowedSelectedCount = Math.max(0, maxImages - localImages.length)
      const nextSelectedIds = selectedIds.slice(0, allowedSelectedCount)
      if (!isEqual(nextSelectedIds, selectedIds)) {
        setSelectedIds(nextSelectedIds)
        updateConfig(configKey, { selectedImageIds: nextSelectedIds })
      }
      // 清理超出限制的本地上传图片（保留 bugsell-ref-* 产品图）
      const currentLocalImages = localMedias.filter(m => m.type === 'image')
      if (currentLocalImages.length > 0 && nextSelectedIds.length + currentLocalImages.length > maxImages) {
        const productRefs = currentLocalImages.filter(m => String(m.id).startsWith('bugsell-ref-'))
        const others = currentLocalImages.filter(m => !String(m.id).startsWith('bugsell-ref-'))
        const keepProduct = Math.min(productRefs.length, maxImages)
        const keepOthers = Math.max(0, maxImages - keepProduct - nextSelectedIds.length)
        const drop = [
          ...others.slice(keepOthers),
          ...productRefs.slice(keepProduct),
        ]
        for (const media of drop) {
          const mediaIndex = localMedias.indexOf(media)
          if (mediaIndex >= 0)
            removeLocalMedia(mediaIndex)
        }
      }
    }
    // 模型切换时检查视频数量是否超限
    const maxVideos = newConfig.maxVideos
    const currentVideos = localMedias.filter(m => m.type === 'video')
    if (currentVideos.length > maxVideos) {
      // 从后往前移除超限视频
      for (let i = currentVideos.length - 1; i >= maxVideos; i--) {
        const mediaIndex = localMedias.indexOf(currentVideos[i]!)
        if (mediaIndex >= 0)
          removeLocalMedia(mediaIndex)
      }
      toast.warning(t('detail.videoCountExceeded', { max: maxVideos }))
    }
    // 切换模型后 clamp duration 到新模型范围
    const durationLimits = getVideoDurationLimits(modelInfos, nextResolution, isVideoEditMode)
    if (duration > durationLimits.max) {
      setDuration(durationLimits.max)
      updateConfig(configKey, { duration: durationLimits.max })
    }
    else if (duration < durationLimits.min) {
      setDuration(durationLimits.min)
      updateConfig(configKey, { duration: durationLimits.min })
    }
  }, [aspectRatio, duration, configKey, updateConfig, localImages.length, localMedias, localVideos.length, removeLocalMedia, selectedIds, t, pricingData?.videoModels, isVideoEditMode])

  const handleModelSelectionModeChange = useCallback((mode: ModelSelectionMode) => {
    setModelSelectionMode(mode)
    if (mode !== 'single')
      return

    const selectedVideoModel = selectedVideoModels[0]
    if (selectedVideoModels.length > 1 && selectedVideoModel)
      handleVideoModelsChange([selectedVideoModel])

    const selectedImageModel = selectedImageModels[0]
    if (selectedImageModels.length > 1 && selectedImageModel)
      handleImageModelsChange([selectedImageModel])
  }, [handleImageModelsChange, handleVideoModelsChange, selectedImageModels, selectedVideoModels])
  const handlePlatformsChange = useCallback((platforms: PlatType[]) => {
    setSelectedPlatforms(platforms)
    updateConfig(configKey, { selectedPlatforms: platforms, platformPreset: 'custom' })
    setPlatformPreset('custom')
  }, [configKey, updateConfig])

  const handlePlatformPresetChange = useCallback((preset: 'connected' | 'all' | 'custom') => {
    setPlatformPreset(preset)
    const next = resolvePlatformsByPreset(preset, accountList, selectedPlatforms)
    setSelectedPlatforms(next)
    updateConfig(configKey, { platformPreset: preset, selectedPlatforms: next })
  }, [accountList, configKey, selectedPlatforms, updateConfig])

  // Keep Connected preset in sync when accounts load/change
  useEffect(() => {
    if (platformPreset !== 'connected')
      return
    const next = resolvePlatformsByPreset('connected', accountList, [])
    if (!isEqual(next, selectedPlatforms)) {
      setSelectedPlatforms(next)
      updateConfig(configKey, { selectedPlatforms: next, platformPreset: 'connected' })
    }
  }, [accountList, platformPreset]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDraftModeChange = useCallback((isDraft: boolean) => {
    if (forceDraftMode) {
      setIsDraftMode(true)
      updateConfig(configKey, { isDraftMode: true })
      return
    }
    setIsDraftMode(isDraft)
    updateConfig(configKey, { isDraftMode: isDraft })
  }, [configKey, forceDraftMode, updateConfig])

  const handleCaptionPromptChange = useCallback((value: string) => {
    setCaptionPrompt(value)
    updateConfig(configKey, { captionPrompt: value })
  }, [configKey, updateConfig])

  const handleCaptionSystemPromptChange = useCallback((value: string) => {
    setCaptionSystemPrompt(value)
    updateConfig(configKey, { captionSystemPrompt: value })
  }, [configKey, updateConfig])

  const handleMoreOptionsOpenChange = useCallback((open: boolean) => {
    setMoreOptionsOpen(open)
    updateConfig(configKey, { captionPromptOpen: open })
  }, [configKey, updateConfig])

  // 重置所有配置到默认值
  const handleReset = useCallback(() => {
    const currentLinkedBrandId = brandInfo?.id || getConfig(configKey).linkedBrandId || ''
    const firstVideoModel = pricingData?.videoModels?.[0]?.name ?? ('' as VideoModelType)
    const firstVideoModelInfo = pricingData?.videoModels?.[0]
    const firstVideoModelConfig = getVideoModelStaticConfig(firstVideoModel, pricingData?.videoModels)
    const firstVideoResolution = getVideoModelDefaultResolution(firstVideoModelInfo)
    const nextAspectRatio = firstVideoModelConfig.supportedRatios.has('9:16')
      ? '9:16'
      : ([...firstVideoModelConfig.supportedRatios][0] ?? '9:16')
    const firstImageModel = pricingData?.imageModels?.[0]
    const nextPromptValue = defaultPrompt || ''
    const nextSelectedImageIds = imageList.length > 0
      ? imageList.slice(0, Math.min(5, firstVideoModelConfig.maxImages, imageList.length)).map(img => img.id)
      : []

    clearMedias()
    videoDurationMapRef.current.clear()

    updateConfig(configKey, {
      aspectRatio: nextAspectRatio,
      duration: 15,
      resolution: firstVideoResolution,
      quantity: 1,
      modelType: firstVideoModel,
      selectedVideoModels: firstVideoModel ? [firstVideoModel] : [],
      contentType: 'video',
      imageModel: firstImageModel?.model ?? 'nb2',
      selectedImageModels: firstImageModel?.model ? [firstImageModel.model] : [],
      imageCount: 3,
      imageSize: firstImageModel?.pricing?.[0]?.resolution ?? '1K',
      selectedPlatforms: availablePlatforms,
      persistedMedias: [],
      selectedImageIds: nextSelectedImageIds,
      promptValue: nextPromptValue,
      captionPrompt: '',
      captionPromptOpen: true,
      captionSystemPrompt: defaultCaptionSystemPrompt,
      captionSystemPromptDefault: defaultCaptionSystemPrompt,
      isDraftMode: true,
      linkedBrandId: currentLinkedBrandId,
    })

    setAspectRatio(nextAspectRatio)
    setDuration(15)
    setResolution(firstVideoResolution)
    setModelType(firstVideoModel)
    setSelectedVideoModels(firstVideoModel ? [firstVideoModel] : [])
    setContentType('video')
    setImageModel(firstImageModel?.model ?? 'nb2')
    setSelectedImageModels(firstImageModel?.model ? [firstImageModel.model] : [])
    setImageCount(3)
    setImageSize(firstImageModel?.pricing?.[0]?.resolution ?? '1K')
    setQuantity(1)
    setIsDraftMode(true)
    setSelectedPlatforms(availablePlatforms)
    setPromptValue(nextPromptValue)
    setCaptionPrompt('')
    setCaptionSystemPrompt(defaultCaptionSystemPrompt)
    setCaptionSystemPromptDefault(defaultCaptionSystemPrompt)
    setMoreOptionsOpen(true)
    setSelectedIds(nextSelectedImageIds)

    defaultPromptFilledRef.current = !!nextPromptValue
    initialSelectionDone.current = nextSelectedImageIds.length > 0
  }, [availablePlatforms, brandInfo?.id, clearMedias, configKey, defaultCaptionSystemPrompt, defaultPrompt, getConfig, imageList, pricingData, updateConfig])

  // 本地上传处理
  const handleLocalUpload = useCallback(async (files: FileList) => {
    const fileArray = Array.from(files)
    const imageFiles = fileArray.filter(f => f.type.startsWith('image/'))
    const videoFiles = fileArray.filter(f => f.type.startsWith('video/'))

    // 验证图片数量
    const maxImages = contentType === 'image_text'
      ? currentImageMaxInputImages
      : currentVideoModelConfig.maxImages
    const currentImageCount = selectedIds.length + localImages.length
    if (imageFiles.length > 0 && currentImageCount + imageFiles.length > maxImages) {
      const allowed = Math.max(0, maxImages - currentImageCount)
      if (allowed === 0) {
        toast.warning(t('detail.imageCountExceeded', { max: maxImages }))
        imageFiles.length = 0
      }
      else {
        toast.warning(t('detail.imageCountExceeded', { max: maxImages }))
        imageFiles.splice(allowed)
      }
    }

    // 图文模式不支持视频上传，过滤掉视频文件
    const validVideoFiles: File[] = []
    if (contentType === 'image_text') {
      if (videoFiles.length > 0) {
        toast.warning(t('detail.videoNotSupported'))
      }
    }
    else {
      // 验证视频数量
      const maxVideos = currentVideoModelConfig.maxVideos
      if (videoFiles.length > 0 && localVideos.length + videoFiles.length > maxVideos) {
        const allowed = Math.max(0, maxVideos - localVideos.length)
        if (allowed === 0) {
          toast.warning(t('detail.videoCountExceeded', { max: maxVideos }))
          videoFiles.length = 0
        }
        else {
          toast.warning(t('detail.videoCountExceeded', { max: maxVideos }))
          videoFiles.splice(allowed)
        }
      }

      // 验证视频时长
      const maxDuration = currentVideoModelConfig.maxVideoDuration
      let currentTotalDuration = 0
      videoDurationMapRef.current.forEach(d => currentTotalDuration += d)

      let firstVideoMeta: { width: number, height: number } | null = null
      for (const vf of videoFiles) {
        try {
          const { duration: vDuration, width: vWidth, height: vHeight } = await getVideoMeta(vf)
          if (currentTotalDuration + vDuration > maxDuration) {
            toast.warning(t('detail.videoDurationExceeded', { max: maxDuration }))
            break
          }
          currentTotalDuration += vDuration
          videoDurationMapRef.current.set(vf.name + vf.size, vDuration)
          validVideoFiles.push(vf)
          if (!firstVideoMeta) {
            firstVideoMeta = { width: vWidth, height: vHeight }
          }
        }
        catch {
          toast.error(t('detail.videoLoadFailed'))
        }
      }

      // 用第一个有效视频的宽高自动匹配比例（仅在之前没有视频时）
      if (firstVideoMeta && localVideos.length === 0) {
        const supported = currentVideoModelConfig.supportedRatios
        const matched = matchClosestRatio(firstVideoMeta.width, firstVideoMeta.height, supported)
        if (matched && matched !== aspectRatio) {
          setAspectRatio(matched)
          updateConfig(configKey, { aspectRatio: matched })
        }
      }
    }

    const validFiles = [...imageFiles, ...validVideoFiles]
    if (validFiles.length > 0) {
      // 构建 FileList
      const dt = new DataTransfer()
      validFiles.forEach(f => dt.items.add(f))
      uploadMedias(dt.files)
    }
  }, [currentVideoModelConfig, currentImageMaxInputImages, contentType, imageModel, selectedIds.length, localImages.length, localVideos.length, uploadMedias, aspectRatio, configKey, updateConfig, t])

  // 拖拽事件处理
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCountRef.current++
    if (dragCountRef.current === 1)
      setIsDragging(true)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCountRef.current--
    if (dragCountRef.current === 0)
      setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCountRef.current = 0
    setIsDragging(false)
    const files = e.dataTransfer.files
    if (files.length > 0)
      handleLocalUpload(files)
  }, [handleLocalUpload])

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.items)
      .filter(item => item.kind === 'file')
      .map(item => item.getAsFile())
      .filter((file): file is File => Boolean(file))

    if (files.length === 0)
      return

    e.preventDefault()
    const dataTransfer = new DataTransfer()
    files.forEach(file => dataTransfer.items.add(file))
    void handleLocalUpload(dataTransfer.files)
  }, [handleLocalUpload])

  const handleSubmit = useCallback(async () => {
    // 上传中拦截
    if (isUploading) {
      toast.warning(t('detail.mediaUploading'))
      return
    }

    // 提示词验证
    if (!promptValue.trim()) {
      toast.warning(t('detail.promptRequired'))
      return
    }

    const captionPromptForSubmit = isDraftMode
      ? mergeCaptionPromptWithSystemRequirement(captionPrompt, captionSystemPrompt)
      : ''

    // Product photo FIRST so I2V locks onto the real SKU (not a random stack image).
    const imageUrls = [
      ...(bugsellProduct?.thumbnailUrl ? [bugsellProduct.thumbnailUrl] : []),
      ...localImages.filter(m => m.url && String(m.id).startsWith('bugsell-ref-')).map(m => m.url!),
      ...selectedImages.map(img => getOssUrl(img.url)),
      ...localImages.filter(m => m.url && !String(m.id).startsWith('bugsell-ref-')).map(m => m.url!),
    ].filter((url, index, arr) => url && arr.indexOf(url) === index)

    // Soft hint only — do not block generate when ref image is missing (except storyboard).
    if (contentType === 'video' && imageUrls.length === 0) {
      if (storyboardMode) {
        toast.error('Storyboard needs a product photo — board alone is plan-only.')
        return
      }
      const i2vOnly = selectedVideoModels.some(m => /1\.5|imagine-video-1/i.test(m))
      toast.warning(i2vOnly
        ? 'No product photo attached — Video 1.5 works best with a reference image (BugSell product or upload).'
        : 'No product photo attached — video quality is better with a BugSell/product reference image.')
    }

    // Fit aspect/duration to selected platforms BEFORE gen (IG Reels 4:5–9:16 etc.)
    let submitAspectRatio = aspectRatio
    let submitDuration = duration
    let forceAspect = contentType === 'video' && !matchSourceAspect
    if (contentType === 'video') {
      if (storyboardMode) {
        // Multi-shot board always 9:16 vertical (~10s stitched)
        submitAspectRatio = '9:16'
        submitDuration = 10
        forceAspect = true
        if (aspectRatio !== '9:16') {
          setAspectRatio('9:16')
          updateConfig(configKey, { aspectRatio: '9:16', duration: 10 })
        }
        if (duration !== 10) {
          setDuration(10)
        }
        setMatchSourceAspect(false)
      }
      else {
      const plats = effectiveSelectedPlatforms.length
        ? effectiveSelectedPlatforms
        : selectedPlatforms
      const preferred = matchSourceAspect ? '1:1' : aspectRatio
      const ready = resolvePublishReadyGenParams({
        platforms: plats,
        preferredAspect: preferred,
        preferredDuration: duration,
        modelRatios: [...currentVideoModelConfig.supportedRatios],
        modelDurationMin: videoDurationLimits.min,
        modelDurationMax: Math.min(videoDurationLimits.max, 15),
        forceSocialPortrait: false,
        fitPlatforms: true,
      })
      submitAspectRatio = ready.aspectRatio
      submitDuration = ready.duration
      if (ready.aspectCorrected) {
        forceAspect = true // pad path on server — never stretch product
        setMatchSourceAspect(false)
        if (ready.aspectRatio !== aspectRatio) {
          setAspectRatio(ready.aspectRatio)
          updateConfig(configKey, { aspectRatio: ready.aspectRatio })
        }
        toast.warning(
          `Aspect → ${ready.aspectRatio} for channels (IG Reels 4:5–9:16 · YT Shorts 9:16 / 16:9). Pad, not stretch.`,
        )
      }
      if (ready.duration !== duration) {
        setDuration(ready.duration)
        updateConfig(configKey, { duration: ready.duration })
      }

      // Still incompatible after auto-fix? Block gen and surface reasons.
      const stillBad = checkPlatformCompatibility(
        {
          contentType: 'video',
          aspectRatio: submitAspectRatio,
          duration: submitDuration,
          imageCount,
        },
        plats,
        t,
      )
      const blocking = [...stillBad.entries()].filter(([, reasons]) => reasons.length > 0)
      if (blocking.length > 0) {
        const msg = blocking
          .slice(0, 3)
          .map(([plat, reasons]) => `${plat}: ${reasons[0]}`)
          .join('\n')
        toast.error(`Fix platform settings before generate:\n${msg}`)
        return
      }
      }
    }

    if (contentType === 'image_text') {
      if (selectedImageModels.length === 0) {
        toast.warning(t('detail.selectModelRequired'))
        return
      }
      if (currentImageAspectRatios.length === 0 || imagePricing.length === 0) {
        toast.warning(t('detail.noCommonModelParams'))
        return
      }

      const result = await createImageTextBatchGenerationWithModels(
        effectiveQuantity,
        selectedImageModels,
        promptValue.trim(),
        imageCount,
        aspectRatio,
        imageUrls.length > 0 ? imageUrls : undefined,
        groupId,
        imageSize,
        effectiveSelectedPlatforms.length > 0 ? effectiveSelectedPlatforms : undefined,
        isDraftMode ? 'draft' : 'image',
        captionPromptForSubmit || undefined,
      )
      if (result.success) {
        if (result.failedCount > 0) {
          toast.warning(t('detail.multiModelPartialSuccess', { success: result.successCount, failed: result.failedCount }))
        }
        else {
          toast.success(t('detail.imageTextGenerated'))
        }
        onGenerated?.()
      }
      else {
        toast.error(result.errorMessage || t('detail.multiModelGenerateFailed'))
      }
    }
    else {
      if (selectedVideoModels.length === 0) {
        toast.warning(t('detail.selectModelRequired'))
        return
      }
      if (currentVideoModelConfig.supportedRatios.size === 0) {
        toast.warning(t('detail.noCommonModelParams'))
        return
      }

      const videoUrls = localVideos.filter(v => v.url).map(v => v.url)

      if (storyboardMode) {
        toast.info(
          `Storyboard: board→Scene 1/2/3 commercial prompt · 1× product I2V · ${duration || 10}s · 9:16`,
        )
      }

      const result = await createBatchGenerationWithModels(
        effectiveQuantity,
        selectedVideoModels,
        submitDuration,
        resolution || undefined,
        submitAspectRatio,
        promptValue.trim() || undefined,
        imageUrls.length > 0 ? imageUrls : undefined,
        videoUrls.length > 0 ? videoUrls : undefined,
        groupId,
        effectiveSelectedPlatforms.length > 0 ? effectiveSelectedPlatforms : undefined,
        isDraftMode ? 'draft' : 'video',
        captionPromptForSubmit || undefined,
        forceAspect,
        storyboardMode
          ? {
              mode: 'storyboard',
              productTitle: bugsellProduct?.productTitle,
              productUrl: bugsellProduct?.productUrl,
              productImageUrl: bugsellProduct?.thumbnailUrl || imageUrls[0],
              productNotes: bugsellProduct?.productNotes,
            }
          : undefined,
      )
      if (result.success) {
        if (result.failedCount > 0) {
          toast.warning(t('detail.multiModelPartialSuccess', { success: result.successCount, failed: result.failedCount }))
        }
        else {
          toast.success(storyboardMode ? `Storyboard commercial queued (${duration || 10}s)` : t('detail.aiBatchGenerate'))
        }
        onGenerated?.()
      }
      else {
        toast.error(result.errorMessage || t('detail.multiModelGenerateFailed'))
      }
    }
  }, [promptValue, aspectRatio, duration, resolution, selectedImages, localImages, localVideos, effectiveQuantity, createBatchGenerationWithModels, createImageTextBatchGenerationWithModels, contentType, selectedImageModels, selectedVideoModels, currentImageAspectRatios.length, imagePricing.length, currentVideoModelConfig.supportedRatios, imageCount, isUploading, t, groupId, onGenerated, effectiveSelectedPlatforms, selectedPlatforms, isDraftMode, captionPrompt, captionSystemPrompt, bugsellProduct, configKey, updateConfig, matchSourceAspect, videoDurationLimits.min, videoDurationLimits.max, storyboardMode])

  // Prompts 探索页 URL（根据当前模型族切换 grok / seedance 提示词页）
  const promptsExploreUrl = useMemo(() => {
    const lngPath = PROMPTS_EXPLORE_LNG_MAP[lng]
    const promptSlug = getPromptsExploreSlugByModel(currentVideoModelInfo?.name ?? modelType)
    return lngPath
      ? `https://youmind.com/${lngPath}/${promptSlug}`
      : `https://youmind.com/${promptSlug}`
  }, [currentVideoModelInfo?.name, lng, modelType])

  // 动态 Placeholder
  const placeholder = useMemo(() => {
    const storeName = brandInfo?.name
    return storeName
      ? t('detail.promptPlaceholderWithStore', { storeName })
      : t('detail.promptPlaceholder')
  }, [brandInfo?.name, t])

  // 视频提示文本（传给 ImageStack 用于 Tooltip）
  const videoHintText = useMemo(() => {
    return t('detail.videoHintGrok')
  }, [t])

  // 上传能力判断
  const maxUploadImages = contentType === 'image_text' ? currentImageMaxInputImages : currentVideoModelConfig.maxImages
  const canUploadImage = selectedIds.length + localImages.length < maxUploadImages
  const canUploadVideo = contentType === 'video' && currentVideoModelConfig.maxVideos > 0 && localVideos.length < currentVideoModelConfig.maxVideos

  /** Collect ref images: user paste/upload first, BugSell catalog thumb only as extra. */
  const collectRefImageUrls = useCallback(() => {
    const userLocal = localImages
      .filter(m => m.url && !String(m.id).startsWith('bugsell-ref-'))
      .map(m => m.url!)
    const selected = selectedImages.map(img => getOssUrl(img.url)).filter(Boolean)
    const bugsellRefs = [
      ...(bugsellProduct?.thumbnailUrl ? [bugsellProduct.thumbnailUrl] : []),
      ...localImages.filter(m => m.url && String(m.id).startsWith('bugsell-ref-')).map(m => m.url!),
    ]
    // User stack is primary (storyboard / main product paste). BugSell is optional catalog.
    const ordered = userLocal.length || selected.length
      ? [...userLocal, ...selected, ...bugsellRefs]
      : [...bugsellRefs]
    return ordered.filter((url, index, arr) => url && arr.indexOf(url) === index)
  }, [bugsellProduct?.thumbnailUrl, localImages, selectedImages])

  const dismissVisionPanel = useCallback(() => {
    if (visionDismissTimerRef.current) {
      clearTimeout(visionDismissTimerRef.current)
      visionDismissTimerRef.current = null
    }
    setVisionRun(IDLE_VISION_STATE)
  }, [])

  const cancelVisionRun = useCallback(() => {
    visionAbortRef.current?.abort()
    visionAbortRef.current = null
    setVisionPromptLoading(false)
    setVisionRun(prev => ({
      ...prev,
      active: false,
      step: 'error',
      stage: 'Cancelled',
      error: 'Vision cancelled',
      percent: prev.percent,
    }))
  }, [])

  /** Vision on ALL ref images → fill staff prompt. Live NDJSON progress in panel. */
  const handleVisionGenPrompt = useCallback(async () => {
    const imageUrls = collectRefImageUrls()
    const hasBugsellCatalog = Boolean(
      bugsellProduct?.productTitle || bugsellProduct?.productUrl,
    )

    if (!imageUrls[0] && !promptValue.trim() && !hasBugsellCatalog) {
      toast.warning('Add a reference image (upload / paste) first — Vision reads your refs')
      return
    }
    if (!imageUrls[0]) {
      toast.warning('Vision works best with a product photo — upload or paste a ref image')
    }

    // Abort any prior run
    visionAbortRef.current?.abort()
    if (visionDismissTimerRef.current) {
      clearTimeout(visionDismissTimerRef.current)
      visionDismissTimerRef.current = null
    }
    const abort = new AbortController()
    visionAbortRef.current = abort

    setVisionPromptLoading(true)
    setVisionRun({
      active: true,
      percent: 3,
      stage: 'Starting Vision…',
      step: 'collect',
      detail: hasBugsellCatalog ? 'Refs + BugSell catalog' : 'Reference images only',
      refCount: imageUrls.length,
      previewUrls: imageUrls,
    })

    try {
      // Don't send stale auto-prompt as "user brief" when it looks like previous Vision output
      const rawPrompt = promptValue.trim()
      const looksLikeStaleVision = (
        (/^Product:\s/i.test(rawPrompt) && /Scene:|Camera:|Hashtags:|Print\/art:/i.test(rawPrompt))
        || /fashion commercial for|Scene 1 \(/i.test(rawPrompt)
        || /BOARD_REF_|PRODUCT_REF:/i.test(rawPrompt)
      )
      const userBrief = looksLikeStaleVision ? '' : rawPrompt

      const res = await fetch('/api/ai/creative-vision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/x-ndjson',
        },
        signal: abort.signal,
        body: JSON.stringify({
          stream: true,
          productTitle: hasBugsellCatalog ? (bugsellProduct?.productTitle || '') : '',
          productUrl: hasBugsellCatalog ? (bugsellProduct?.productUrl || '') : '',
          productNotes: hasBugsellCatalog ? (bugsellProduct?.productNotes || '') : '',
          prompt: userBrief,
          imageUrl: imageUrls[0] || '',
          imageUrls,
          bugsellCatalog: hasBugsellCatalog,
          catalogSource: hasBugsellCatalog ? 'bugsell' : 'refs',
          platforms: effectiveSelectedPlatforms.length
            ? effectiveSelectedPlatforms
            : selectedPlatforms,
          duration: duration || 10,
          aspectRatio: matchSourceAspect ? '9:16' : (aspectRatio || '9:16'),
          provider: 'auto',
          // Prefer commercial board path when Storyboard mode is on
          mode: storyboardMode ? 'storyboard' : undefined,
          preferStoryboard: storyboardMode,
        }),
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => null) as { message?: string } | null
        throw new Error(errJson?.message || `Vision failed (HTTP ${res.status})`)
      }

      const contentType = res.headers.get('content-type') || ''
      type VisionResultData = {
        prompt?: string
        motionPrompt?: string
        title?: string
        caption?: string
        hashtags?: string[]
        source?: string
        provider?: string
        refImageCount?: number
        mode?: string
        planSource?: string
        duration?: number
        boardIsPlanOnly?: boolean
        productHeroUrl?: string | null
        boardRefUrls?: string[]
        classified?: Array<{ url: string, role: string }>
        vision?: { scene?: string, productType?: string }
      }

      let resultData: VisionResultData | null = null
      let resultMessage = ''

      // Prefer NDJSON stream (live steps)
      if (contentType.includes('ndjson') && res.body) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done)
            break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed)
              continue
            let evt: Record<string, unknown>
            try {
              evt = JSON.parse(trimmed) as Record<string, unknown>
            }
            catch {
              continue
            }
            if (evt.type === 'progress') {
              setVisionRun(prev => ({
                ...prev,
                active: true,
                percent: Number(evt.percent) || prev.percent,
                stage: String(evt.stage || prev.stage),
                step: (String(evt.step || prev.step) as VisionStepId) || prev.step,
                detail: evt.detail != null ? String(evt.detail) : prev.detail,
                refCount: evt.refCount != null ? Number(evt.refCount) : prev.refCount,
                resolvedCount: evt.resolvedCount != null ? Number(evt.resolvedCount) : prev.resolvedCount,
                provider: evt.provider != null ? String(evt.provider) : prev.provider,
                previewUrls: imageUrls,
              }))
            }
            else if (evt.type === 'result' && evt.data && typeof evt.data === 'object') {
              resultData = evt.data as VisionResultData
              resultMessage = String(evt.message || '')
            }
            else if (evt.type === 'error') {
              throw new Error(String(evt.message || 'Vision failed'))
            }
          }
        }
      }
      else {
        // Non-stream JSON fallback
        const json = await res.json().catch(() => null) as {
          code?: number
          message?: string
          data?: VisionResultData
        } | null
        if (!json || json.code !== 0 || !json.data)
          throw new Error(json?.message || 'Vision prompt failed')
        resultData = json.data
        resultMessage = String(json.message || '')
      }

      if (!resultData)
        throw new Error('Vision returned no result')

      const next = String(resultData.prompt || resultData.motionPrompt || '').trim()
      if (!next)
        throw new Error('Vision returned empty prompt')

      handlePromptValueChange(next)
      if (resultData.caption && isDraftMode)
        handleCaptionPromptChange(String(resultData.caption).slice(0, 500))

      const via = resultData.source === 'agent'
        ? (resultData.provider || 'Grok')
        : 'template'
      const n = resultData.refImageCount || imageUrls.length || 0
      const isCommercial = resultData.mode === 'storyboard_commercial'
      const boardN = resultData.boardRefUrls?.length || 0

      setVisionRun({
        active: false,
        percent: 100,
        stage: isCommercial
          ? `Commercial ${resultData.duration || duration || 10}s prompt · board plan-only`
          : resultData.source === 'agent'
            ? `Catalog brief · ${n} ref${n === 1 ? '' : 's'}`
            : `Fallback (${via})`,
        step: 'done',
        detail: isCommercial
          ? (boardN ? `${boardN} board marked plan-only · product = video hero` : 'Auto beats · product hero')
          : hasBugsellCatalog ? 'BugSell + refs' : 'From refs',
        refCount: n,
        resolvedCount: n,
        provider: via,
        previewUrls: imageUrls,
        resultTitle: resultData.title,
        resultScene: resultData.vision?.scene || resultData.vision?.productType,
        resultSource: resultData.source,
        mode: resultData.mode,
      })

      // Auto-enable storyboard mode when vision found a board (ops should gen as commercial)
      if (isCommercial && boardN > 0 && !storyboardMode) {
        setStoryboardMode(true)
        setContentType('video')
        updateConfig(configKey, { contentType: 'video', aspectRatio: '9:16' })
        setAspectRatio('9:16')
        setMatchSourceAspect(false)
      }

      if (resultData.source !== 'agent') {
        toast.warning(`Vision fallback (${via}) — check Grok pool / clearer product photo`)
      }
      else if (isCommercial) {
        toast.success(
          boardN
            ? `Storyboard detected · ${resultData.duration || duration || 10}s commercial prompt · board not video hero`
            : `Commercial ${resultData.duration || duration || 10}s prompt ready`,
        )
      }
      else {
        toast.success(`Vision ready · ${n} ref${n === 1 ? '' : 's'} · review then Generate`)
      }

      // Auto-collapse success panel after staff has a moment to see chips
      visionDismissTimerRef.current = setTimeout(() => {
        setVisionRun(IDLE_VISION_STATE)
        visionDismissTimerRef.current = null
      }, 8_000)

      void resultMessage
    }
    catch (e) {
      if (abort.signal.aborted) {
        // cancelVisionRun already set error state
        return
      }
      const msg = e instanceof Error ? e.message : 'Vision prompt failed'
      setVisionRun(prev => ({
        ...prev,
        active: false,
        step: 'error',
        stage: 'Vision failed',
        error: msg,
        percent: prev.percent || 0,
        previewUrls: imageUrls,
      }))
      toast.error(msg)
    }
    finally {
      if (visionAbortRef.current === abort)
        visionAbortRef.current = null
      setVisionPromptLoading(false)
    }
  }, [
    aspectRatio,
    bugsellProduct,
    collectRefImageUrls,
    configKey,
    duration,
    effectiveSelectedPlatforms,
    handleCaptionPromptChange,
    handlePromptValueChange,
    isDraftMode,
    matchSourceAspect,
    promptValue,
    selectedPlatforms,
    storyboardMode,
    updateConfig,
  ])

  // Cleanup vision timers / abort on unmount
  useEffect(() => {
    return () => {
      visionAbortRef.current?.abort()
      if (visionDismissTimerRef.current)
        clearTimeout(visionDismissTimerRef.current)
    }
  }, [])

  const applyBugSellProduct = useCallback((selection: ProductPickerSelection) => {
    // Identity only in staff prompt — motion locks + letterbox run server-side.
    const prompt = [
      `Product: ${selection.productTitle}`,
      `URL: ${selection.productUrl}`,
      selection.productNotes ? `Context: ${selection.productNotes}` : '',
    ].filter(Boolean).join('\n')

    setBugsellProduct(selection)
    handlePromptValueChange(prompt)
    // Prefer source aspect only if selected platforms allow it (IG Reels needs 4:5–9:16).
    if (contentType === 'video') {
      const plats = effectiveSelectedPlatforms.length ? effectiveSelectedPlatforms : selectedPlatforms
      const ready = resolvePublishReadyGenParams({
        platforms: plats,
        preferredAspect: '1:1', // typical catalog photo
        preferredDuration: duration || 15,
        modelRatios: [...currentVideoModelConfig.supportedRatios],
        modelDurationMin: 6,
        modelDurationMax: 15,
        forceSocialPortrait: false,
        fitPlatforms: true,
      })
      if (ready.aspectCorrected) {
        setMatchSourceAspect(false)
        setAspectRatio(ready.aspectRatio)
        updateConfig(configKey, { aspectRatio: ready.aspectRatio, duration: ready.duration })
        toast.warning(
          `Channels need ${ready.aspectRatio} (e.g. Instagram Reels). Will pad product photo — no stretch.`,
        )
      }
      else {
        setMatchSourceAspect(true)
      }
      setDuration(ready.duration)
      updateConfig(configKey, { duration: ready.duration })
    }
    else {
      setMatchSourceAspect(true)
    }

    // Auto-attach product thumbnail as reference media (required for accurate product video).
    if (selection.thumbnailUrl) {
      const id = `bugsell-ref-${selection.productId || Date.now()}`
      setMedias((prev) => {
        const withoutOldBugSell = prev.filter(m => !String(m.id).startsWith('bugsell-ref-'))
        const next = [
          {
            id,
            url: selection.thumbnailUrl!,
            type: 'image' as const,
            name: selection.productTitle || 'BugSell product',
          },
          ...withoutOldBugSell,
        ]
        const completed: IPersistedMedia[] = next
          .filter((m): m is typeof m & { url: string, id: string } => Boolean(m.url && m.id) && (m.type === 'image' || m.type === 'video'))
          .map(m => ({
            id: m.id,
            url: m.url,
            type: m.type as 'image' | 'video',
            name: m.name,
          }))
        updateConfig(configKey, { persistedMedias: completed })
        return next
      })
    }

    setBugsellPickerOpen(false)
    toast.success(selection.thumbnailUrl
      ? 'BugSell product applied · video will match photo aspect (no stretch). Pick 9:16 to force Reels pad.'
      : 'BugSell product applied to prompt')
  }, [aspectRatio, configKey, contentType, currentVideoModelConfig.supportedRatios, duration, effectiveSelectedPlatforms, handlePromptValueChange, selectedPlatforms, setMedias, updateConfig])

  return (
    <div
      className={cn(styles.container, isVideoEditMode && styles.videoEditMode, isDragging && styles.dragging, className)}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {bugsellProduct && (
        <div
          data-testid="draftbox-bugsell-chip"
          className={SOCIAL_OPS_PRODUCT_CHIP_CLASS}
        >
          <div className={SOCIAL_OPS_PRODUCT_THUMB_CLASS}>
            {bugsellProduct.thumbnailUrl
              ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={bugsellProduct.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                )
              : (
                  <div className="grid h-full place-items-center text-[10px] text-muted-foreground">SKU</div>
                )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              <BugSellMark size={14} className="rounded-sm" />
              BugSell · optional
            </div>
            <div className="truncate text-[13px] font-semibold tracking-tight">{bugsellProduct.productTitle}</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {bugsellProduct.productNotes || bugsellProduct.productUrl}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 rounded-lg text-[12px] text-muted-foreground"
            onClick={() => setBugsellPickerOpen(true)}
          >
            Change
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="Clear BugSell product"
            onClick={() => setBugsellProduct(null)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* 上半区：图片堆叠 + textarea */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-3 p-4 pb-2">
        <div className="flex-shrink-0 pt-1 w-full sm:w-auto">
          <ImageStack
            images={selectedImages}
            allImages={imageList}
            selectedIds={selectedIds}
            maxImages={contentType === 'image_text' ? currentImageMaxInputImages : currentVideoModelConfig.maxImages}
            onImagesChange={handleImagesChange}
            localMedias={localMedias}
            onLocalMediaRemove={handleLocalMediaRemove}
            onLocalUpload={handleLocalUpload}
            modelType={modelType}
            canUploadImage={canUploadImage}
            canUploadVideo={canUploadVideo}
            videoHintText={videoHintText}
            localImageCount={localImages.length}
          />
        </div>
        <div className="relative w-full sm:flex-1 sm:min-w-0">
          <textarea
            data-testid="draftbox-ai-prompt-input"
            className="w-full resize-none bg-transparent text-sm placeholder:text-muted-foreground focus-visible:outline-none min-h-[80px] max-h-[160px] md:min-h-[100px] pr-12"
            placeholder={placeholder}
            value={promptValue}
            onChange={handlePromptChange}
            onCompositionStart={handlePromptCompositionStart}
            onCompositionEnd={handlePromptCompositionEnd}
            onPaste={handlePaste}
            maxLength={PROMPT_MAX_LENGTH}
            rows={3}
          />
          <div className="absolute top-0 right-4 flex flex-col items-center gap-0.5">
            <button
              data-testid="draftbox-bugsell-open-btn"
              type="button"
              className="p-1 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              onClick={() => setBugsellPickerOpen(true)}
              title="Pick BugSell product"
            >
              <ShoppingBag className="h-4 w-4" />
            </button>
            {/* 刷新按钮 - 始终可见 */}
            <button
              data-testid="draftbox-ai-reset-btn"
              type="button"
              className="p-1 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              onClick={handleReset}
              title={t('detail.resetConfig')}
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              data-testid="draftbox-ai-vision-icon-btn"
              type="button"
              className="p-1 text-muted-foreground hover:text-foreground cursor-pointer transition-colors disabled:opacity-40"
              onClick={() => void handleVisionGenPrompt()}
              disabled={visionPromptLoading || isUploading}
              title="Vision → prompt from ref images"
            >
              {visionPromptLoading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Eye className="h-4 w-4" />}
            </button>
            <button
              data-testid="draftbox-ai-open-prompt-editor-btn"
              type="button"
              className="p-1 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              onClick={() => setPromptEditorOpen(true)}
              title={t('detail.openPromptEditor')}
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            {/* 清空按钮 - 有内容时才显示 */}
            {promptValue && (
              <button
                data-testid="draftbox-ai-clear-btn"
                type="button"
                className="p-1 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                onClick={() => {
                  handlePromptValueChange('')
                  setSelectedIds([])
                  clearMedias()
                  videoDurationMapRef.current.clear()
                  updateConfig(configKey, { persistedMedias: [], selectedImageIds: [] })
                }}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 下半区：工具栏 */}
      <div className="px-4 pb-3 pt-0 space-y-2">
        {(visionRun.active || visionRun.step === 'done' || visionRun.step === 'error' || visionRun.error) && (
          <VisionProgressPanel
            state={visionRun}
            onCancel={visionRun.active ? cancelVisionRun : undefined}
            onDismiss={dismissVisionPanel}
          />
        )}
        {platformAspectPreflight && (
          <div
            data-testid="draftbox-platform-aspect-preflight"
            className={cn(
              'flex flex-col gap-1 rounded-xl border px-3 py-2 text-[12px]',
              platformAspectPreflight.blocked.length
                ? 'border-destructive/40 bg-destructive/5 text-destructive'
                : 'border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-100',
            )}
          >
            <div className="font-medium">
              {platformAspectPreflight.blocked.length
                ? 'Platforms need a different video frame before Generate'
                : `Will generate ${platformAspectPreflight.aspect} for selected channels`}
            </div>
            <div className="text-[11px] opacity-90 leading-relaxed">
              Instagram Reels: 4:5–9:16 · YouTube: Shorts 9:16 or landscape 16:9 · multi-post usually 9:16 (pad, no stretch).
              {platformAspectPreflight.notes[0] ? ` · ${platformAspectPreflight.notes[0]}` : ''}
            </div>
            {platformAspectPreflight.blocked.slice(0, 2).map(([plat, reason]) => (
              <div key={plat} className="text-[11px] opacity-90">
                {plat}
                :
                {' '}
                {reason}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {!bugsellProduct && (
            <button
              type="button"
              data-testid="draftbox-bugsell-pick-btn"
              onClick={() => setBugsellPickerOpen(true)}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-border/80',
                'bg-transparent px-2.5 text-[12px] font-medium text-muted-foreground',
                'transition-colors hover:border-foreground/20 hover:bg-muted/40 hover:text-foreground',
              )}
              title="Optional · BugSell production catalog"
            >
              <BugSellMark size={18} className="rounded-md shadow-sm" />
              BugSell
              <span className="text-[10px] font-normal text-muted-foreground/80">optional</span>
            </button>
          )}
          <button
            type="button"
            data-testid="draftbox-vision-prompt-btn"
            onClick={() => void handleVisionGenPrompt()}
            disabled={visionPromptLoading || isUploading}
            className={cn(
              // Match toolbar pills — quiet operator chrome, not a purple promo chip
              'inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors',
              'disabled:opacity-50 disabled:pointer-events-none',
              visionPromptLoading
                ? 'border-border bg-muted text-foreground'
                : 'border-border/80 bg-background text-muted-foreground hover:border-foreground/15 hover:bg-muted/50 hover:text-foreground',
            )}
            title="Vision: read stacked ref images → SEO + motion brief"
          >
            {visionPromptLoading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Eye className="h-3.5 w-3.5" />}
            {visionPromptLoading ? 'Reading…' : 'Vision → prompt'}
          </button>
          <button
            type="button"
            data-testid="draftbox-storyboard-mode-btn"
            onClick={() => {
              const next = !storyboardMode
              setStoryboardMode(next)
              if (next) {
                setContentType('video')
                updateConfig(configKey, { contentType: 'video', aspectRatio: '9:16', duration: 10 })
                setAspectRatio('9:16')
                setDuration(10)
                setMatchSourceAspect(false)
                // Prefer Imagine 1.5 for multi-shot I2V when available
                const prefer15 = pricingData?.videoModels?.find(m =>
                  /grok-imagine-video-1\.5|imagine-video-1\.5/i.test(m.name || ''),
                )
                if (prefer15?.name) {
                  setSelectedVideoModels([prefer15.name])
                  setModelType(prefer15.name)
                  updateConfig(configKey, { modelType: prefer15.name, selectedVideoModels: [prefer15.name] })
                }
                toast.success(
                  'Storyboard ON · Vision builds Scene 1/2/3 commercial prompt · product = only video hero',
                )
              }
              else {
                toast.info('Storyboard off')
              }
            }}
            disabled={isUploading || contentType === 'image_text'}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors',
              'disabled:opacity-50 disabled:pointer-events-none',
              storyboardMode
                ? 'border-border bg-muted text-foreground'
                : 'border-border/80 bg-transparent text-muted-foreground hover:border-foreground/20 hover:bg-muted/40 hover:text-foreground',
            )}
            title="Storyboard: Vision parses board → commercial multi-scene prompt · single product I2V (board is plan-only)."
          >
            <Clapperboard className="h-3.5 w-3.5" />
            Storyboard
          </button>
          <span className="hidden text-[11px] text-muted-foreground sm:inline">
            {visionPromptLoading
              ? (visionRun.stage || 'Working…')
              : storyboardMode
                ? `Commercial ${duration || 10}s · product I2V`
                : 'Vision: product + board → prompt'}
          </span>
        </div>
        <ToolBarInline
          contentType={contentType}
          selectedVideoModels={selectedVideoModels}
          modelSelectionMode={modelSelectionMode}
          aspectRatio={aspectRatio}
          duration={duration}
          resolution={resolution || defaultVideoResolution}
          quantity={effectiveQuantity}
          selectedImageModels={selectedImageModels}
          imageCount={imageCount}
          imageSize={imageSize}
          imageAspectRatios={currentImageAspectRatios}
          imageModelOptions={imageModelOptions}
          imagePricing={imagePricing}
          videoModels={pricingData?.videoModels}
          videoAspectRatios={[...currentVideoModelConfig.supportedRatios]}
          videoResolutions={currentVideoResolutions}
          videoModelOptions={videoModelOptions}
          videoDurationLimits={videoDurationLimits}
          totalCredits={totalCredits}
          isVideoEditMode={isVideoEditMode}
          inputVideoDuration={inputVideoDuration}
          isPricingLoading={isPricingLoading}
          isLoading={isGeneratingBatch || isUploading}
          promptsExploreUrl={promptsExploreUrl}
          promptsExploreLabel={t('detail.exploreMorePrompts')}
          isDraftMode={isDraftMode}
          hideNonDraftModes={forceDraftMode}
          selectedPlatforms={selectedPlatforms}
          platformPreset={platformPreset}
          connectedPlatformCount={connectedPlatforms.length}
          effectiveLimitsDetailed={effectiveLimitsDetailed}
          disabledPlatforms={incompatiblePlatforms}
          moreOptionsOpen={moreOptionsOpen}
          onDraftModeChange={handleDraftModeChange}
          onContentTypeChange={handleContentTypeChange}
          onVideoModelsChange={handleVideoModelsChange}
          onModelSelectionModeChange={handleModelSelectionModeChange}
          onResolutionChange={handleResolutionChange}
          onAspectRatioChange={handleAspectRatioChange}
          onDurationChange={handleDurationChange}
          onQuantityChange={handleQuantityChange}
          onImageModelsChange={handleImageModelsChange}
          onImageCountChange={handleImageCountChange}
          onImageSizeChange={handleImageSizeChange}
          onPlatformsChange={handlePlatformsChange}
          onPlatformPresetChange={handlePlatformPresetChange}
          onMoreOptionsChange={handleMoreOptionsOpenChange}
          onSubmit={handleSubmit}
        />
      </div>

      {/* 文案要求输入框（仅草稿生成显示） */}
      {isDraftMode && moreOptionsOpen && (
        <div className="px-4 pb-3 space-y-1.5">
          <textarea
            className="w-full resize-none bg-muted/30 rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none min-h-[56px] max-h-[100px]"
            placeholder={t('detail.captionPromptPlaceholder')}
            value={captionPrompt}
            onChange={e => handleCaptionPromptChange(e.target.value)}
            maxLength={PROMPT_MAX_LENGTH}
            rows={2}
          />
          <div className="flex flex-col gap-1 px-1 sm:flex-row sm:items-center">
            <div className="flex shrink-0 items-center gap-1 text-xs font-normal text-muted-foreground/65 sm:w-24">
              <span>{t('detail.systemCaptionPrompt')}</span>
              <CircleHelp
                className="h-2.5 w-2.5 cursor-help text-muted-foreground/50 hover:text-muted-foreground"
                aria-label={t('detail.systemCaptionPromptTip')}
              />
            </div>
            <Input
              className="h-5 rounded-none border-x-0 border-t-0 border-b border-dashed border-border/35 bg-transparent px-0 py-0 text-xs leading-none text-muted-foreground/75 shadow-none md:text-xs focus-visible:border-muted-foreground/55 focus-visible:text-foreground focus-visible:ring-0"
              placeholder={defaultCaptionSystemPrompt || t('detail.systemCaptionPromptPlaceholder')}
              value={captionSystemPrompt}
              onChange={e => handleCaptionSystemPromptChange(e.target.value)}
              maxLength={PROMPT_MAX_LENGTH}
            />
          </div>
        </div>
      )}

      <PromptEditorDialog
        open={promptEditorOpen}
        value={promptValue}
        placeholder={placeholder}
        maxLength={PROMPT_MAX_LENGTH}
        onOpenChange={setPromptEditorOpen}
        onSave={handlePromptValueChange}
        onPaste={handlePaste}
      />

      <Sheet
        open={bugsellPickerOpen}
        onOpenChange={(open) => {
          setBugsellPickerOpen(open)
          if (open)
            prefetchBugSellCatalog()
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl lg:max-w-4xl"
          data-testid="draftbox-bugsell-sheet"
        >
          <SheetHeader className="space-y-0 border-b border-border/80 px-4 py-3 text-left sm:px-5">
            <div className="flex items-center justify-between gap-3 pr-8">
              <SheetTitle className="flex items-center gap-2 text-[14px] font-semibold tracking-tight leading-none">
                <BugSellMark size={20} className="rounded-md shadow-sm" />
                BugSell catalog
              </SheetTitle>
              <SheetDescription className="sr-only">
                Browse BugSell products and shops. Apply one to prefill your generation prompt.
              </SheetDescription>
              <span className="hidden text-[11px] text-muted-foreground sm:inline">
                Apply → prompt + photo ref
              </span>
            </div>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <BugSellProductPicker embedded onSelect={applyBugSellProduct} />
          </div>
        </SheetContent>
      </Sheet>

      {/* 拖拽上传遮罩 */}
      {isDragging && (
        <div className={styles.overlay}>
          <Upload className="h-8 w-8 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{t('detail.dropToUpload')}</span>
        </div>
      )}
    </div>
  )
})

AiBatchGenerateBar.displayName = 'AiBatchGenerateBar'

export default AiBatchGenerateBar
