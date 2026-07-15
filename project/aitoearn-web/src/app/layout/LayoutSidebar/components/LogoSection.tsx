/**
 * LogoSection - 侧边栏 Logo 区域
 */

'use client'

import type { LogoSectionProps } from '../types'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { BRAND_TITLE, BrandWordmark } from '@/app/layout/shared'
import logo from '@/assets/images/logo.png'
import { cn } from '@/lib/utils'

/** Sidebar brand mark — larger so the ladybug reads clearly at a glance. */
const LOGO_PX = 48

export function LogoSection({ collapsed, onToggle }: LogoSectionProps) {
  return (
    <div
      className={cn(
        'mb-3 flex items-center',
        collapsed ? 'justify-center px-1 py-2.5' : 'justify-between px-2 py-2.5',
      )}
    >
      {collapsed ? (
        // 收起状态：默认显示 logo，hover 时显示展开按钮
        <div className="relative flex h-12 w-12 items-center justify-center">
          {/* Logo - 默认显示，hover 时隐藏 */}
          <Link
            href="/"
            className="flex items-center justify-center transition-opacity group-hover:opacity-0"
            data-testid="sidebar-logo-link"
          >
            <Image
              src={logo}
              alt={BRAND_TITLE}
              width={LOGO_PX}
              height={LOGO_PX}
              className="h-12 w-12 rounded-xl object-cover shadow-sm ring-1 ring-border/60"
              priority
            />
          </Link>
          {/* 展开按钮 - 默认隐藏，hover 时显示 */}
          <button
            onClick={onToggle}
            className="absolute inset-0 flex items-center justify-center rounded-xl border-none bg-transparent text-muted-foreground/70 opacity-0 transition-opacity hover:bg-brand-cyan/10 hover:text-brand-cyan group-hover:opacity-100"
            data-testid="sidebar-toggle-btn"
          >
            <PanelLeftOpen size={20} />
          </button>
        </div>
      ) : (
        <>
          <Link
            href="/"
            className="group/logo flex min-w-0 items-center gap-3 text-foreground no-underline hover:opacity-85"
            data-testid="sidebar-logo-link"
          >
            <Image
              src={logo}
              alt={BRAND_TITLE}
              width={LOGO_PX}
              height={LOGO_PX}
              className="h-12 w-12 shrink-0 rounded-xl object-cover shadow-sm ring-1 ring-border/60"
              priority
            />
            <BrandWordmark as="h1" size="sidebar" className="text-[1.15rem]" />
          </Link>
          <button
            onClick={onToggle}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border-none bg-transparent text-muted-foreground/70 transition-colors hover:bg-brand-cyan/10 hover:text-brand-cyan"
            data-testid="sidebar-toggle-btn"
          >
            <PanelLeftClose size={18} />
          </button>
        </>
      )}
    </div>
  )
}
