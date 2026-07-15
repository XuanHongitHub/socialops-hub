import { apiOk, makeAccount, readBody, readJson, taskFile, upsertAccount, type FacebookPage, type MetaTask } from '@/app/api/plat/meta/_local'

async function latestPages() {
  const tasks = await readJson<Record<string, MetaTask>>(taskFile, {})
  return Object.values(tasks)
    .filter(task => task.platform === 'facebook' && task.pages?.length)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.pages || []
}

export async function GET() {
  const pages = await latestPages()
  return apiOk(pages.map(page => ({
    id: page.id,
    name: page.name,
    profile_picture_url: page.picture?.data?.url || '',
  })), '/api/plat/meta/facebook/pages')
}

export async function POST(req: Request) {
  const body = await readBody(req)
  const selected = Array.isArray(body.pageIds) ? body.pageIds.map(String) : []
  const pages = await latestPages()
  const selectedPages = pages.filter(page => selected.includes(page.id))
  for (const page of selectedPages) {
    await upsertAccount(makeAccount({
      type: 'facebook',
      uid: page.id,
      account: page.name,
      nickname: page.name,
      avatar: page.picture?.data?.url,
      accessToken: page.access_token,
    }))
    if (page.instagram_business_account?.id) {
      await upsertAccount(makeAccount({
        type: 'instagram',
        uid: page.instagram_business_account.id,
        account: page.instagram_business_account.username || page.name,
        nickname: page.instagram_business_account.username || page.name,
        accessToken: page.access_token,
      }))
    }
  }
  return apiOk({ success: true, selectedPageIds: selectedPages.map(page => page.id) }, '/api/plat/meta/facebook/pages')
}
