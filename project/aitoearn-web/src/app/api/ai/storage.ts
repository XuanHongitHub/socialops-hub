import { join, resolve } from 'node:path'

const appData = process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Roaming')

export const socialOpsMediaRoot = resolve(process.env.SOCIALOPS_MEDIA_ROOT || join(appData, 'SocialsHub'))
export const generatedVideoDir = join(socialOpsMediaRoot, 'generated-videos')
