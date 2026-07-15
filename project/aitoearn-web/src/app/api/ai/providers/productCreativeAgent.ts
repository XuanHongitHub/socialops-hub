/**
 * Product creative agent: Vision → multi-channel SEO pack → I2V motion brief.
 * Uses Grok OAuth pool and/or 9Router — not a fixed marketing template.
 */

import { call9RouterChat, clampPublishPack, parseAiContentPack } from './_local'
import { callGrokChat } from './grok/_client'
import {
  asBool,
  asString,
  asStringArray,
  buildProductCreativeAgentPrompt,
  composeMotionPromptFromAgent,
  templateProductCreativePlan,
  type ProductCreativeAgentInput,
  type ProductCreativePlan,
  type ProductMotionBrief,
  type ProductVisionContext,
} from './productCreativeAgentCore'
import { productVideoMotionPrompt } from './productVideoMotion'
import { resolveImagesForVision } from './resolveVisionImage'

export type {
  ProductCreativeAgentInput,
  ProductCreativePlan,
  ProductMotionBrief,
  ProductVisionContext,
} from './productCreativeAgentCore'

export {
  buildProductCreativeAgentPrompt,
  composeMotionPromptFromAgent,
  templateProductCreativePlan,
} from './productCreativeAgentCore'

function normalizePlan(
  raw: Record<string, unknown>,
  input: ProductCreativeAgentInput,
  provider: string,
  source: ProductCreativePlan['source'],
): ProductCreativePlan {
  const visionRaw = (raw.vision && typeof raw.vision === 'object' ? raw.vision : {}) as Record<string, unknown>
  const seoRaw = (raw.seo && typeof raw.seo === 'object' ? raw.seo : raw) as Record<string, unknown>
  const motionRaw = (raw.motion && typeof raw.motion === 'object' ? raw.motion : {}) as Record<string, unknown>
  const anglesRaw = (raw.channelAngles && typeof raw.channelAngles === 'object' ? raw.channelAngles : {}) as Record<string, unknown>

  const topicMax = Math.min(8, Math.max(1, Number(input.topicMax) || 5))
  const titleMax = Math.min(100, Math.max(16, Number(input.titleMax) || 80))
  const pack = clampPublishPack({
    title: seoRaw.title || input.productTitle,
    caption: seoRaw.caption || input.productNotes,
    hashtags: seoRaw.hashtags,
  }, { topicMax, titleMax })

  const vision: ProductVisionContext = {
    productType: asString(visionRaw.productType, 80),
    materials: asString(visionRaw.materials, 80),
    colors: asString(visionRaw.colors, 80),
    printOrArtwork: asString(visionRaw.printOrArtwork, 160),
    printHasFaces: asBool(visionRaw.printHasFaces),
    scene: asString(visionRaw.scene, 200),
    mood: asString(visionRaw.mood, 80),
    giftOccasion: asString(visionRaw.giftOccasion, 80),
  }

  const motionBrief: ProductMotionBrief = {
    scene: asString(motionRaw.scene, 280),
    camera: asString(motionRaw.camera, 120),
    lighting: asString(motionRaw.lighting, 120),
    audioBed: asString(motionRaw.audioBed, 160),
    fabricMotion: asString(motionRaw.fabricMotion, 120),
    avoid: asStringArray(motionRaw.avoid, 8),
  }

  const agentMotionDraft = asString(raw.motionPrompt || motionRaw.prompt, 1200)
  const motionPrompt = source === 'agent' && (agentMotionDraft || motionBrief.scene)
    ? composeMotionPromptFromAgent({
        agentMotionPrompt: agentMotionDraft,
        motionBrief,
        vision,
        productTitle: input.productTitle || pack.title,
        duration: input.duration,
        aspectRatio: input.aspectRatio,
        hasReferenceImage: input.hasReferenceImage,
        letterboxed: input.letterboxed,
        productNotes: input.productNotes,
      })
    : productVideoMotionPrompt({
        productTitle: input.productTitle || pack.title,
        productNotes: input.productNotes,
        productUrl: input.productUrl,
        userPrompt: input.userPrompt,
        duration: input.duration,
        aspectRatio: input.aspectRatio,
        hasReferenceImage: input.hasReferenceImage,
        letterboxed: input.letterboxed,
      })

  const channelAngles: Record<string, string> = {}
  for (const [k, v] of Object.entries(anglesRaw)) {
    const s = asString(v, 160)
    if (s)
      channelAngles[k.toLowerCase()] = s
  }

  const isBugsell = Boolean(
    input.bugsellCatalog
    || /bugsell/i.test(String(input.productUrl || ''))
    || /bugsell/i.test(String(input.productTitle || '')),
  )
  const fallbackCaption = isBugsell ? 'Find it on BugSell' : 'Shot from your product reference'
  const fallbackTitle = asString(input.productTitle, titleMax)
    || (input.hasReferenceImage ? 'Product from reference photo' : 'Product video')

  return {
    source,
    provider,
    vision,
    title: pack.title || fallbackTitle,
    caption: pack.caption || asString(input.productNotes, 200) || fallbackCaption,
    hashtags: pack.hashtags,
    channelAngles,
    motionBrief,
    motionPrompt,
    agentMotionDraft: agentMotionDraft || undefined,
  }
}

export type ProductCreativeProgress = {
  percent: number
  stage: string
  step: 'collect' | 'resolve' | 'vision' | 'compose' | 'done' | 'error'
  detail?: string
  refCount?: number
  resolvedCount?: number
  provider?: string
}

/**
 * Vision + multi-channel SEO + motion brief.
 * Provider order (auto): Grok OAuth pool → 9Router → static template.
 * Local `/api/assets/*` refs are resolved to data URLs so vision actually sees them.
 */
export async function runProductCreativeAgent(
  input: ProductCreativeAgentInput,
  onProgress?: (p: ProductCreativeProgress) => void | Promise<void>,
): Promise<ProductCreativePlan> {
  const report = async (p: ProductCreativeProgress) => {
    try {
      await onProgress?.(p)
    }
    catch { /* UI progress must never break agent */ }
  }

  const timeoutMs = Math.min(55_000, Math.max(12_000, Number(input.timeoutMs) || 40_000))
  const rawUrls = [
    ...(Array.isArray(input.imageUrls) ? input.imageUrls : []),
    input.imageUrl || '',
  ]
    .map(u => String(u || '').trim())
    .filter(Boolean)
    .filter((u, i, arr) => arr.indexOf(u) === i)
    .slice(0, 4)

  await report({
    percent: 8,
    stage: 'Collecting reference images',
    step: 'collect',
    refCount: rawUrls.length,
    detail: rawUrls.length
      ? `${rawUrls.length} ref${rawUrls.length === 1 ? '' : 's'} in stack`
      : 'No image — title/notes only',
  })

  // Critical: local SocialOps uploads are relative paths — Grok cannot fetch them.
  await report({
    percent: 18,
    stage: 'Preparing images for vision',
    step: 'resolve',
    refCount: rawUrls.length,
    detail: rawUrls.length ? 'Decoding local uploads → vision-ready' : 'Skip resolve',
  })

  const visionImages = rawUrls.length
    ? await resolveImagesForVision(rawUrls)
    : []
  const visionImage = visionImages[0]
  const hasVision = visionImages.length > 0

  if (rawUrls.length && !hasVision) {
    console.warn('[productCreativeAgent] could not resolve any ref image for vision', rawUrls)
  }

  await report({
    percent: 28,
    stage: hasVision
      ? `Vision ready · ${visionImages.length} image${visionImages.length === 1 ? '' : 's'}`
      : 'No readable image — text-only brief',
    step: 'resolve',
    refCount: rawUrls.length,
    resolvedCount: visionImages.length,
    detail: hasVision
      ? 'Local paths converted; sending to model'
      : (rawUrls.length ? 'Could not open refs — check uploads' : undefined),
  })

  const prompt = buildProductCreativeAgentPrompt({
    ...input,
    imageUrl: visionImage || undefined,
    imageUrls: visionImages.length ? visionImages : undefined,
    hasReferenceImage: hasVision || Boolean(input.hasReferenceImage),
  })
  const system
    = 'You are SocialOps Product Creative Director. Return strict JSON only. '
      + 'Use vision on every attached image. Ground title/scene/print in what you SEE. '
      + 'Never invent generic marketplace listings when photos are attached. '
      + 'Optimize SEO for social channels. Ground motion in the real product photo.'

  const prefer = String(input.provider || 'auto').toLowerCase()

  const tryGrok = async () => {
    await report({
      percent: 40,
      stage: 'Reading product with Grok vision',
      step: 'vision',
      provider: 'grok',
      resolvedCount: visionImages.length,
      detail: 'Scene · print · colors · mood',
    })
    const r = await callGrokChat(prompt, 'grok-4', {
      timeoutMs,
      system,
      imageUrls: visionImages,
      imageUrl: visionImage,
    })
    return { text: r.text, provider: 'grok' as const }
  }
  const tryRouter = async () => {
    await report({
      percent: 42,
      stage: 'Reading product with 9Router vision',
      step: 'vision',
      provider: '9router',
      resolvedCount: visionImages.length,
      detail: 'Fallback multimodal chat',
    })
    const r = await call9RouterChat(prompt, {
      system,
      imageUrls: visionImages,
      imageUrl: visionImage,
      timeoutMs,
    })
    return { text: r.text, provider: '9router' as const }
  }

  let text = ''
  let provider = 'none'
  try {
    if (prefer === 'grok') {
      const r = await tryGrok()
      text = r.text
      provider = r.provider
    }
    else if (prefer === '9router') {
      const r = await tryRouter()
      text = r.text
      provider = r.provider
    }
    else {
      try {
        const r = await tryGrok()
        text = r.text
        provider = r.provider
      }
      catch (e1) {
        console.warn('[productCreativeAgent] grok failed, trying 9router', e1)
        await report({
          percent: 48,
          stage: 'Grok busy — trying 9Router',
          step: 'vision',
          provider: '9router',
          detail: e1 instanceof Error ? e1.message.slice(0, 80) : 'retry',
        })
        try {
          const r = await tryRouter()
          text = r.text
          provider = r.provider
        }
        catch (e2) {
          console.warn('[productCreativeAgent] 9router failed', e2)
          await report({
            percent: 90,
            stage: 'Providers failed — template brief',
            step: 'compose',
            detail: 'Check Grok OAuth pool',
          })
          return templateProductCreativePlan(input, 'providers_failed')
        }
      }
    }
  }
  catch (e) {
    console.warn('[productCreativeAgent] agent failed', e)
    await report({
      percent: 90,
      stage: 'Agent error — template brief',
      step: 'compose',
    })
    return templateProductCreativePlan(input, 'agent_error')
  }

  await report({
    percent: 78,
    stage: 'Composing SEO + motion brief',
    step: 'compose',
    provider,
    detail: 'Title · caption · camera · audio',
  })

  if (!text?.trim()) {
    await report({ percent: 92, stage: 'Empty model response', step: 'compose' })
    return templateProductCreativePlan(input, 'empty_response')
  }

  const parsed = parseAiContentPack(text)
  const hasSignal = Boolean(
    parsed.motionPrompt
    || parsed.seo
    || parsed.vision
    || parsed.title
    || parsed.motion,
  )
  if (!hasSignal) {
    await report({ percent: 92, stage: 'Unparseable response', step: 'compose' })
    return templateProductCreativePlan(input, 'unparseable')
  }

  const plan = normalizePlan(parsed, input, provider, 'agent')
  await report({
    percent: 100,
    stage: 'Vision brief ready',
    step: 'done',
    provider,
    resolvedCount: visionImages.length,
    detail: plan.title,
  })
  return plan
}
