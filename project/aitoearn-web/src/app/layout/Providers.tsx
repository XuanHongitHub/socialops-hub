/**
 * Providers - global app providers (OAuth, theme, toast, login dialog, settings)
 * Uses current codebase module paths (layout SettingsModal, store/*).
 * autoLoginToken: SocialOps local admin token from layout server props / env.
 */

'use client'

import { GoogleOAuthProvider } from '@react-oauth/google'
import { ThemeProvider } from 'next-themes'
import { usePathname } from 'next/navigation'
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/shallow'
import ConfigManagerDialog from '@/app/layout/ConfigManagerDialog'
import LoginDialog from '@/app/layout/LoginDialog'
import SettingsModal from '@/app/layout/SettingsModal'
import { isPublicPage } from '@/app/layout/shared/utils/routeUtils'
import { WechatBrowserOverlay } from '@/components/common/WechatBrowserOverlay'
import { PluginPublishingFloatButton } from '@/components/Plugin'
import NotificationCenter from '@/components/ui/NotificationCenter'
import { Toaster } from '@/components/ui/sonner'
import { useConfigManagerDialogStore } from '@/store/configManagerDialog'
import { useLoginDialogStore } from '@/store/login-dialog'
import { usePlatformMetadataStore } from '@/store/platformMetadata'
import { useSettingsModalStore } from '@/store/settingsModal'
import { useUserStore } from '@/store/user'

const PublicRouteContext = createContext(false)

export function usePublicRoute() {
  return useContext(PublicRouteContext)
}

export function Providers({
  children,
  lng,
  autoLoginToken,
}: {
  children: React.ReactNode
  lng: string
  autoLoginToken?: string
}) {
  const pathname = usePathname()
  const publicRoute = isPublicPage(pathname)
  const hasPromptedRef = useRef(false)
  const [authInitialized, setAuthInitialized] = useState(false)

  // Prefer prop, then env (SocialOps local admin)
  const effectiveAutoLoginToken
    = autoLoginToken
      || process.env.NEXT_PUBLIC_LOCAL_ADMIN_TOKEN
      || ''

  const { _hasHydrated, token } = useUserStore(
    useShallow(state => ({
      _hasHydrated: state._hasHydrated,
      token: state.token,
    })),
  )

  useEffect(() => {
    if (usePlatformMetadataStore.getState().loadedLng === lng)
      return
    usePlatformMetadataStore.getState().ensureLoaded(lng)
  }, [lng])

  const { settingsVisible, settingsDefaultTab, closeSettings } = useSettingsModalStore()
  const { open: configManagerOpen, closeDialog: closeConfigManagerDialog } = useConfigManagerDialogStore()

  useEffect(() => {
    if (!_hasHydrated)
      return

    useUserStore.getState().appInit(effectiveAutoLoginToken || undefined)
    setAuthInitialized(true)
  }, [_hasHydrated, effectiveAutoLoginToken])

  useEffect(() => {
    useUserStore.getState().setLang(lng)
  }, [lng])

  // Unauthenticated on protected routes → open login dialog
  useEffect(() => {
    if (!_hasHydrated || !authInitialized)
      return

    if (token) {
      hasPromptedRef.current = false
      return
    }

    if (publicRoute) {
      hasPromptedRef.current = false
      return
    }

    // Local auto-login token: don't spam login dialog
    if (effectiveAutoLoginToken)
      return

    if (hasPromptedRef.current)
      return

    hasPromptedRef.current = true
    useLoginDialogStore.getState().openLoginDialog({ fromGuard: true })
  }, [_hasHydrated, authInitialized, token, pathname, publicRoute, effectiveAutoLoginToken])

  // Google GIS button language
  useLayoutEffect(() => {
    const hl = lng.replace('-', '_')
    const GIS_URL = 'https://accounts.google.com/gsi/client'
    const originalAppendChild = document.body.appendChild.bind(document.body)

    document.body.appendChild = function <T extends Node>(node: T): T {
      if (node instanceof HTMLScriptElement && node.src === GIS_URL) {
        node.src = `${GIS_URL}?hl=${hl}`
      }
      return originalAppendChild(node)
    }

    return () => {
      document.body.appendChild = originalAppendChild
    }
  }, [lng])

  return (
    <PublicRouteContext.Provider value={publicRoute}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
        <GoogleOAuthProvider clientId="1094109734611-flskoscgp609mecqk9ablvc6i3205vqk.apps.googleusercontent.com">
          <Toaster position="top-center" richColors />
          <NotificationCenter />
          <PluginPublishingFloatButton />
          <WechatBrowserOverlay />
          <LoginDialog manualLoginDisabled={Boolean(effectiveAutoLoginToken)} />
          <ConfigManagerDialog open={configManagerOpen} onClose={closeConfigManagerDialog} />
          <SettingsModal
            open={settingsVisible}
            onClose={closeSettings}
            defaultTab={settingsDefaultTab}
          />
          {children}
        </GoogleOAuthProvider>
      </ThemeProvider>
    </PublicRouteContext.Provider>
  )
}
