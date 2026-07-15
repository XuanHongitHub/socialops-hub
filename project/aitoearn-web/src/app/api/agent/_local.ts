import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { call9RouterChat, parseAiContentPack, readJson, renderSocialVideo, socialContentPrompt, writeJson } from '../ai/providers/_local'
import type { AiAsset } from '../ai/providers/_local'
import { callGrokChat } from '../ai/providers/grok/_client'

export type LocalTask = {
  id: string
  userId: string
  prompt: string
  model?: string
  title: string
  description: string
  tags: string[]
  status: 'running' | 'completed' | 'error' | 'aborted'
  medias: Array<{ type: 'VIDEO' | 'IMAGE', url: string, coverUrl?: string }>
  messages: Array<{ type: 'user' | 'assistant' | 'result' | 'error', uuid: string, message?: any, content?: any, result?: any }>
  errorMessage: string
  createdAt: string
  updatedAt: string
}

const taskFile = `${process.env.APPDATA || `${process.env.USERPROFILE || ''}\\AppData\\Roaming`}\\SocialsHub\\agent-tasks.json`

export async function getTasks() {
  const tasks = await readJson<LocalTask[]>(taskFile, [])
  return tasks.map(task => ({
    ...task,
    messages: task.messages.map((message) => {
      if (message.type === 'assistant' && !message.message && typeof message.content === 'string') {
        return { ...message, message: { content: [{ type: 'text', text: message.content }] } }
      }
      if (message.type === 'result' && message.message && typeof message.message === 'object' && !message.result) {
        return { ...message, message: message.message.description || '', result: message.message }
      }
      return message
    }),
  }))
}

export async function saveTasks(tasks: LocalTask[]) {
  await writeJson(taskFile, tasks.slice(0, 200))
}

export function apiTask(task: LocalTask) {
  return task
}

function wantsVideo(prompt: string) {
  return /video|mp4|tiktok|reel|short|youtube shorts|clip/i.test(prompt)
}

function extractTags(text: string) {
  return [...text.matchAll(/#[\p{L}\p{N}_-]+/gu)].map(match => match[0].slice(1)).slice(0, 12)
}

function titleFromPack(pack: Record<string, unknown>, prompt: string) {
  return String(pack.title || prompt.replace(/\s+/g, ' ').trim().slice(0, 80) || 'Social content')
}

export async function createLocalTask(promptInput: unknown, existingTaskId?: string, model?: string) {
  const prompt = typeof promptInput === 'string' ? promptInput : JSON.stringify(promptInput)
  const now = new Date().toISOString()
  if (existingTaskId) {
    const tasks = await getTasks()
    const index = tasks.findIndex(task => task.id === existingTaskId)
    if (index >= 0) {
      tasks[index] = {
        ...tasks[index],
        prompt,
        model: model || tasks[index].model,
        status: 'running',
        errorMessage: '',
        messages: [...tasks[index].messages, { type: 'user', uuid: randomUUID(), content: prompt }],
        updatedAt: now,
      }
      await saveTasks(tasks)
      return tasks[index]
    }
  }
  const task: LocalTask = {
    id: randomUUID(),
    userId: 'local-admin',
    prompt,
    model,
    title: prompt.replace(/\s+/g, ' ').trim().slice(0, 80) || 'SocialOps chat',
    description: '',
    tags: [],
    status: 'running',
    medias: [],
    messages: [{ type: 'user', uuid: randomUUID(), content: prompt }],
    errorMessage: '',
    createdAt: now,
    updatedAt: now,
  }
  const tasks = await getTasks()
  tasks.unshift(task)
  await saveTasks(tasks)
  return task
}

export async function completeLocalTask(taskId: string) {
  const tasks = await getTasks()
  const index = tasks.findIndex(task => task.id === taskId)
  if (index < 0) throw new Error('Local task not found')
  const task = tasks[index]
  try {
    const prompt = task.prompt
    const appContext = [
      'You are the AI assistant inside BugSell Socials Hub, a self-hosted social media operations app.',
      'The app manages owned social channels, content drafts, scheduling, publishing records, media assets, and AI providers.',
      'Current local agent capabilities: answer about the app, create social copy, and generate a video draft when requested.',
      'Do not claim to have connected an account, inspected live channels, published content, or changed settings unless an explicit tool result is provided.',
      'If the user asks for an unavailable operation, explain the limitation and give the exact next step.',
    ].join(' ')
    const conversation = task.messages
      .filter((message, index) =>
        (message.type === 'user' || message.type === 'assistant')
        && !(index === task.messages.length - 1 && message.type === 'user' && String(message.content || '') === prompt),
      )
      .slice(-12)
      .map((message) => {
        const content = message.type === 'user'
          ? String(message.content || '')
          : String(message.message?.content?.find((item: any) => item.type === 'text')?.text || '')
        return `${message.type.toUpperCase()}: ${content}`
      })
      .filter(Boolean)
      .join('\n')
    const system = wantsVideo(prompt)
      ? `${appContext} Return only JSON for a social video pack with keys title, caption, hashtags, shortVideoScript, storyboard, publishChecklist.`
      : `${appContext} Return concise, helpful answers. Include title, caption, hashtags when useful for content requests.`
    const selectedModel = task.model || 'cx_agy'
    const routedPrompt = wantsVideo(prompt)
      ? socialContentPrompt({ productNotes: `${conversation}\nUSER REQUEST: ${prompt}`, platform: 'tiktok' })
      : `${conversation}\nUSER REQUEST: ${prompt}`
    const chat = selectedModel.startsWith('grok::')
      ? await callGrokChat(routedPrompt, selectedModel.slice('grok::'.length))
      : await call9RouterChat(routedPrompt, { model: selectedModel, system })
    const pack = wantsVideo(prompt) ? parseAiContentPack(chat.text) : { title: task.title, caption: chat.text, hashtags: extractTags(chat.text) }
    let asset: AiAsset | null = null
    if (wantsVideo(prompt)) asset = await renderSocialVideo(pack, { productNotes: prompt, platform: 'tiktok' })
    const text = String(pack.caption || chat.text || '')
    const title = titleFromPack(pack, prompt)
    const tags = Array.isArray(pack.hashtags) ? pack.hashtags.map(String).map(tag => tag.replace(/^#/, '')) : extractTags(text)
    const medias = asset ? [{ type: 'VIDEO' as const, url: asset.url }] : []
    tasks[index] = {
      ...task,
      title,
      description: text,
      tags,
      medias,
      status: 'completed',
      messages: [
        ...task.messages,
        { type: 'assistant', uuid: randomUUID(), message: { content: [{ type: 'text', text }] } },
        { type: 'result', uuid: randomUUID(), message: text, result: { taskId, title, description: text, tags, medias, type: asset ? 'videoOnly' : 'fullContent', action: 'draft', platform: wantsVideo(prompt) ? 'tiktok' : undefined } },
      ],
      updatedAt: new Date().toISOString(),
    }
  }
  catch (error) {
    tasks[index] = { ...task, status: 'error', errorMessage: error instanceof Error ? error.message : String(error), messages: [...task.messages, { type: 'error', uuid: randomUUID(), content: error instanceof Error ? error.message : String(error) }], updatedAt: new Date().toISOString() }
  }
  await saveTasks(tasks)
  return tasks[index]
}

export function jsonOk(data: unknown, url: string) {
  return NextResponse.json({ code: 0, data, message: 'ok', url })
}

