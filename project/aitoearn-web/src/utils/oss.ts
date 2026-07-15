// 获取完整的OSS URL
export function getOssUrl(path?: string) {
  if (!path)
    return ''
  if (
    path.startsWith('http')
    || path.startsWith('https')
    || path.startsWith('ossProxy')
    || path.startsWith('/ossProxy/')
    || path.startsWith('blob:http')
    || path.startsWith('blob:https')
    // Local SocialOps assets (user upload + AI archive) are same-origin absolute paths
    || path.startsWith('/api/')
  ) {
    return path
  }
  const base = process.env.NEXT_PUBLIC_OSS_URL ?? ''
  const normalizedPath = base.includes('socialops.bebio.site') && path.startsWith('/') && !path.startsWith('/aitoearn/')
    ? `/aitoearn${path}`
    : path
  return `${base}${normalizedPath}`
}

// 将完整的oss url转为代理的 oss url
export function getOssProxyPath(ossUrl?: string) {
  if (!ossUrl)
    return ''

  return ossUrl?.replace(
    process.env.NEXT_PUBLIC_OSS_URL ?? '',
    process.env.NEXT_PUBLIC_OSS_URL_PROXY ?? '',
  )
}
