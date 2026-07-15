/**
 * LoginDialog Store - global login dialog state (SocialOps auto-login aware)
 */

import { create } from 'zustand'

interface LoginDialogState {
  visible: boolean
  redirectUrl?: string
  inviteCode?: string
  /** Opened from protected-route guard (close → navigate home) */
  fromGuard: boolean
  /** Env auto-login token present → hide manual login */
  manualLoginDisabled: boolean
  /** Bumps when a disabled-manual-login notice should toast */
  manualLoginDisabledNoticeSeq: number
  openLoginDialog: (options?: { redirectUrl?: string, inviteCode?: string, fromGuard?: boolean }) => void
  closeLoginDialog: () => void
  setManualLoginDisabled: (disabled: boolean) => void
  requestManualLoginDisabledNotice: () => void
}

export const useLoginDialogStore = create<LoginDialogState>(set => ({
  visible: false,
  redirectUrl: undefined,
  inviteCode: undefined,
  fromGuard: false,
  manualLoginDisabled: false,
  manualLoginDisabledNoticeSeq: 0,
  openLoginDialog: options =>
    set((state) => {
      if (state.manualLoginDisabled) {
        return {
          visible: false,
          redirectUrl: undefined,
          inviteCode: undefined,
          fromGuard: false,
          manualLoginDisabledNoticeSeq: state.manualLoginDisabledNoticeSeq + 1,
        }
      }

      return {
        visible: true,
        redirectUrl: options?.redirectUrl,
        inviteCode: options?.inviteCode,
        fromGuard: options?.fromGuard ?? false,
      }
    }),
  closeLoginDialog: () =>
    set({
      visible: false,
      redirectUrl: undefined,
      inviteCode: undefined,
      fromGuard: false,
    }),
  setManualLoginDisabled: disabled =>
    set({
      manualLoginDisabled: disabled,
      ...(disabled
        ? {
            visible: false,
            redirectUrl: undefined,
            inviteCode: undefined,
            fromGuard: false,
          }
        : {}),
    }),
  requestManualLoginDisabledNotice: () =>
    set(state => ({
      visible: false,
      redirectUrl: undefined,
      inviteCode: undefined,
      fromGuard: false,
      manualLoginDisabledNoticeSeq: state.manualLoginDisabledNoticeSeq + 1,
    })),
}))
