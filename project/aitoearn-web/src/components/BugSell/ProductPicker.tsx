'use client'

import {
  ArrowLeft,
  Check,
  ExternalLink,
  Loader2,
  Package,
  Search,
  Star,
  Store,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  clearBugSellClientCache,
  getBugSellStatus,
  peekBugSellCache,
  searchBugSellProducts,
  searchBugSellShops,
  type BugSellGenInput,
  type BugSellProductCard,
  type BugSellShopCard,
  type BugSellStatus,
} from '@/api/bugsell'
import { BugSellMark } from '@/components/BugSell/BugSellMark'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/utils/className'

const PRODUCTS_URL = '/api/local/bugsell/products?per_page=12'
const SHOPS_URL = '/api/local/bugsell/shops?per_page=12'
const STATUS_URL = '/api/local/bugsell/status'

type Mode = 'product' | 'shop'

export type ProductPickerSelection = BugSellGenInput & {
  product: BugSellProductCard
}

type Props = {
  onSelect: (selection: ProductPickerSelection) => void
  /** When true, omit outer chrome (for embedding in a Sheet that already has a header). */
  embedded?: boolean
  className?: string
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount)
}

function productPrice(product: BugSellProductCard) {
  if (product.salePrice != null && product.salePrice < product.price) {
    return {
      current: formatMoney(product.salePrice),
      original: formatMoney(product.price),
      onSale: true,
    }
  }
  return { current: formatMoney(product.price), original: null as string | null, onSale: false }
}

function shopInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0)
    return '?'
  if (parts.length === 1)
    return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

function buildGenInput(product: BugSellProductCard, activeShop?: BugSellShopCard | null): BugSellGenInput {
  const price = productPrice(product)
  const priceLabel = price.onSale && price.original
    ? `${price.current} (was ${price.original})`
    : price.current
  // Brand for social SEO = BugSell marketplace (not the small seller shop name).
  // Seller is catalog metadata only — never feed "Shop: City Cats" into captions (AI turns it into "Shop now at City Cats").
  return {
    productUrl: product.storeUrl,
    productTitle: product.name,
    productNotes: [
      'Marketplace brand: BugSell',
      product.category?.name ? `Category: ${product.category.name}` : '',
      `Price: ${priceLabel}`,
      product.isCustomizable ? 'Customizable product' : '',
      // Optional internal context — models must not use seller as the public CTA brand
      product.shop?.name || product.shopName
        ? `Seller (internal only, never name in CTA): ${product.shop?.name || product.shopName}`
        : '',
    ].filter(Boolean).join(' · '),
    thumbnailUrl: product.thumbnailUrl,
    productId: product.id,
    productSlug: product.slug,
    shopSlug: product.shop?.slug || activeShop?.slug || null,
  }
}

function ProductRow({
  product,
  selected,
  onClick,
}: {
  product: BugSellProductCard
  selected?: boolean
  onClick: () => void
}) {
  const price = productPrice(product)
  return (
    <button
      type="button"
      data-testid={`bugsell-product-${product.slug}`}
      onClick={onClick}
      className={cn(
        'group flex w-full gap-3 rounded-xl border bg-card p-2.5 text-left transition-all',
        'hover:border-foreground/15 hover:bg-muted/30 hover:shadow-sm',
        selected
          ? 'border-foreground/25 bg-muted/40 ring-1 ring-foreground/10 shadow-sm'
          : 'border-border/80',
      )}
    >
      <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg border border-border/70 bg-muted">
        {product.thumbnailUrl
          ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.thumbnailUrl} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
            )
          : (
              <div className="grid h-full place-items-center text-muted-foreground">
                <Package className="h-5 w-5 opacity-50" />
              </div>
            )}
        {selected && (
          <div className="absolute inset-0 flex items-end justify-end bg-gradient-to-tl from-foreground/40 to-transparent p-1.5">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-background text-foreground shadow-sm">
              <Check className="h-3 w-3" />
            </span>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <div className="line-clamp-2 text-[13px] font-semibold leading-snug tracking-tight text-foreground">
          {product.name}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13px] font-semibold tabular-nums text-foreground">{price.current}</span>
          {price.original && (
            <span className="text-[11px] tabular-nums text-muted-foreground line-through">{price.original}</span>
          )}
          {product.isCustomizable && (
            <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[10px] font-medium">
              Custom
            </Badge>
          )}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {(product.shop?.name || product.shopName) && (
            <span className="truncate">{product.shop?.name || product.shopName}</span>
          )}
          {product.category?.name && (
            <>
              <span className="text-border">·</span>
              <span className="truncate">{product.category.name}</span>
            </>
          )}
        </div>
      </div>
    </button>
  )
}

function CatalogSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-1" data-testid="bugsell-catalog-skeleton">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex gap-3 rounded-xl border border-border/60 bg-card/80 p-2.5"
        >
          <Skeleton className="h-14 w-14 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2 py-0.5">
            <Skeleton className="h-3.5 w-[70%]" />
            <Skeleton className="h-3 w-[40%]" />
            <Skeleton className="h-3 w-[55%]" />
          </div>
        </div>
      ))}
    </div>
  )
}

function ShopRow({
  shop,
  onClick,
}: {
  shop: BugSellShopCard
  onClick: () => void
}) {
  return (
    <button
      type="button"
      data-testid={`bugsell-shop-${shop.slug}`}
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl border border-border/80 bg-card p-2.5 text-left transition-all',
        'hover:border-foreground/15 hover:bg-muted/30 hover:shadow-sm',
      )}
    >
      <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border/70 bg-gradient-to-br from-muted to-muted/50 text-[12px] font-semibold tracking-wide text-muted-foreground">
        {shop.avatar
          ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shop.avatar} alt="" className="h-full w-full object-cover" />
            )
          : shopInitials(shop.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate text-[13px] font-semibold tracking-tight">{shop.name}</div>
          {shop.averageRating > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums text-muted-foreground">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {shop.averageRating.toFixed(1)}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            {shop.productsCount}
            {' '}
            products
          </span>
          {shop.totalSalesCount > 0 && (
            <>
              <span className="text-border">·</span>
              <span className="tabular-nums">
                {shop.totalSalesCount.toLocaleString()}
                {' '}
                sold
              </span>
            </>
          )}
        </div>
      </div>
      <Store className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />
    </button>
  )
}

export function BugSellProductPicker({ onSelect, embedded = false, className }: Props) {
  // Instant hydrate from cache so sheet never shows blank "Loading catalog…"
  const cachedStatus = peekBugSellCache<BugSellStatus>(STATUS_URL)
  const cachedProducts = peekBugSellCache<{ items: BugSellProductCard[] }>(PRODUCTS_URL)
  const cachedShops = peekBugSellCache<{ items: BugSellShopCard[] }>(SHOPS_URL)

  const [status, setStatus] = useState<BugSellStatus | null>(
    () => cachedStatus?.data ?? null,
  )
  // Default Products — one hop to SKU (shops is secondary browse)
  const [mode, setMode] = useState<Mode>('product')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(
    !(cachedProducts?.data?.items?.length || cachedShops?.data?.items?.length),
  )
  const [error, setError] = useState<string | null>(null)
  const [products, setProducts] = useState<BugSellProductCard[]>(
    () => cachedProducts?.data?.items || [],
  )
  const [shops, setShops] = useState<BugSellShopCard[]>(
    () => cachedShops?.data?.items || [],
  )
  const [activeShop, setActiveShop] = useState<BugSellShopCard | null>(null)
  const [selected, setSelected] = useState<BugSellProductCard | null>(null)

  useEffect(() => {
    let cancelled = false
    // Parallel: status + default product browse (no sequential waterfall)
    void Promise.all([
      getBugSellStatus().catch((e): { code: number, data: BugSellStatus } => ({
        code: 0,
        data: {
          enabled: false,
          apiUrl: null,
          storeUrl: null,
          reason: String(e),
          flows: [],
          auth: 'public_storefront',
        },
      })),
      searchBugSellProducts({ perPage: 12 }).catch(() => null),
    ]).then(([statusRes, productRes]) => {
      if (cancelled)
        return
      const st = statusRes.data
      setStatus(st)
      if (st?.enabled && productRes?.code === 0) {
        setProducts(productRes.data?.items || [])
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const runProductSearch = useCallback(async (q: string, shop?: string, fresh = false) => {
    setLoading(true)
    setError(null)
    try {
      const res = await searchBugSellProducts({ q: q || undefined, shop, perPage: 12, fresh })
      if (res.code !== 0)
        throw new Error(res.message || 'Search failed')
      setProducts(res.data.items || [])
    }
    catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setProducts([])
    }
    finally {
      setLoading(false)
    }
  }, [])

  const runShopSearch = useCallback(async (q: string, fresh = false) => {
    setLoading(true)
    setError(null)
    try {
      const res = await searchBugSellShops({ q: q || undefined, perPage: 12, fresh })
      if (res.code !== 0)
        throw new Error(res.message || 'Shop search failed')
      setShops(res.data.items || [])
    }
    catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setShops([])
    }
    finally {
      setLoading(false)
    }
  }, [])

  const openShop = async (shop: BugSellShopCard) => {
    setActiveShop(shop)
    setSelected(null)
    setQuery('')
    setLoading(true)
    setError(null)
    try {
      // Single request — skip shop detail hop (was sequential + slow)
      const res = await searchBugSellProducts({ shop: shop.slug, perPage: 12 })
      if (res.code !== 0)
        throw new Error(res.message || 'Failed to load shop products')
      setProducts(res.data.items || [])
    }
    catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setProducts([])
    }
    finally {
      setLoading(false)
    }
  }

  const onSearch = async (fresh = false) => {
    if (mode === 'product') {
      setActiveShop(null)
      await runProductSearch(query.trim(), undefined, fresh)
      return
    }
    if (activeShop) {
      await runProductSearch(query.trim(), activeShop.slug, fresh)
      return
    }
    await runShopSearch(query.trim(), fresh)
  }

  useEffect(() => {
    if (!status?.enabled)
      return
    // Products already prefetched on mount; only load shops when switching mode
    if (mode === 'shop' && !activeShop && shops.length === 0)
      void runShopSearch('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.enabled, mode])

  const confirmSelect = (product: BugSellProductCard) => {
    setSelected(product)
  }

  const applySelected = () => {
    if (!selected)
      return
    onSelect({ ...buildGenInput(selected, activeShop), product: selected })
  }

  const listCount = useMemo(() => {
    if (mode === 'shop' && !activeShop)
      return shops.length
    return products.length
  }, [mode, activeShop, shops.length, products.length])

  const selectedPrice = selected ? productPrice(selected) : null
  const bootstrapping = !status
  const disabled = status && !status.enabled

  if (disabled) {
    return (
      <div
        data-testid="bugsell-picker-disabled"
        className={cn(
          'rounded-2xl border border-dashed border-border/80 bg-muted/15 px-4 py-8',
          className,
        )}
      >
        <div className="flex items-center gap-2">
          <BugSellMark size={22} className="rounded-md" />
          <div className="text-[13px] font-semibold text-foreground">BugSell catalog unavailable</div>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          {status?.reason || 'Enable with BUGSELL_ENABLED=true to browse the production storefront catalog.'}
        </p>
      </div>
    )
  }

  return (
    <div
      data-testid="bugsell-picker"
      className={cn(
        'flex min-h-0 flex-col bg-background',
        !embedded && 'overflow-hidden rounded-2xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)]',
        className,
      )}
    >
      {!embedded && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <BugSellMark size={22} className="rounded-md shadow-sm" />
            <div>
              <div className="text-[14px] font-semibold tracking-tight">BugSell catalog</div>
              <div className="text-[11px] text-muted-foreground">Pick a product · apply to generation</div>
            </div>
          </div>
          {bootstrapping && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Connecting…
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-3 py-1.5 sm:px-4">
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border bg-background p-0.5">
            <button
              type="button"
              data-testid="bugsell-mode-shop"
              className={cn(
                'rounded px-2.5 py-1 text-[11.5px] font-medium transition-colors',
                mode === 'shop' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => {
                setMode('shop')
                setActiveShop(null)
                setSelected(null)
                setQuery('')
              }}
            >
              Shops
            </button>
            <button
              type="button"
              data-testid="bugsell-mode-product"
              className={cn(
                'rounded px-2.5 py-1 text-[11.5px] font-medium transition-colors',
                mode === 'product' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => {
                setMode('product')
                setActiveShop(null)
                setSelected(null)
                setQuery('')
              }}
            >
              Products
            </button>
          </div>
          {activeShop && (
            <>
              <div className="hidden h-4 w-px bg-border sm:block" />
              <div className="hidden min-w-0 items-center gap-1.5 sm:flex">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 gap-1 px-1.5 text-[11.5px]"
                  data-testid="bugsell-back-shops"
                  onClick={() => {
                    setActiveShop(null)
                    setProducts([])
                    setSelected(null)
                    void runShopSearch(query)
                  }}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  All shops
                </Button>
                <span className="truncate text-[12px] font-semibold">{activeShop.name}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {activeShop.productsCount || products.length}
                  {' '}
                  products
                </span>
                <a
                  className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                  href={activeShop.storeUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Storefront
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            disabled={loading}
            onClick={() => {
              clearBugSellClientCache()
              void onSearch(true)
            }}
            title="Bypass cache and reload catalog"
          >
            Refresh
          </button>
          <div className="text-[11px] tabular-nums text-muted-foreground">
            {loading ? 'Searching…' : `${listCount} result${listCount === 1 ? '' : 's'}`}
          </div>
        </div>
      </div>

      <div className="space-y-2.5 p-3 sm:p-4">
        {activeShop && (
          <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-muted/20 px-2 py-1.5 sm:hidden">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 gap-1 px-1.5 text-[11.5px]"
              onClick={() => {
                setActiveShop(null)
                setProducts([])
                setSelected(null)
                void runShopSearch(query)
              }}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              All shops
            </Button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-semibold">{activeShop.name}</div>
              <div className="text-[10.5px] text-muted-foreground">
                {activeShop.productsCount || products.length}
                {' '}
                products
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              data-testid="bugsell-search-input"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter')
                  void onSearch()
              }}
              placeholder={
                mode === 'product'
                  ? 'Search products by name…'
                  : activeShop
                    ? `Filter products in ${activeShop.name}…`
                    : 'Search shops by name…'
              }
              className="h-9 rounded-lg border-border/80 bg-card pl-8 shadow-none"
            />
          </div>
          <Button
            data-testid="bugsell-search-btn"
            className="h-9 shrink-0 rounded-lg px-3.5"
            disabled={loading}
            onClick={() => void onSearch()}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
          </Button>
        </div>

        {error && (
          <div
            data-testid="bugsell-error"
            className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-[12px] text-destructive"
          >
            {error}
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(240px,280px)]">
          <div className="relative max-h-[min(560px,calc(100vh-11rem))] space-y-2 overflow-y-auto overscroll-contain rounded-xl border border-border/70 bg-muted/10 p-2">
            {loading && listCount === 0 && <CatalogSkeleton rows={7} />}

            {mode === 'shop' && !activeShop && !loading && shops.length === 0 && (
              <div className="px-3 py-14 text-center">
                <Store className="mx-auto h-8 w-8 text-muted-foreground/40" />
                <div className="mt-3 text-[13px] font-medium text-foreground">No shops found</div>
                <p className="mt-1 text-[12px] text-muted-foreground">Try another search term.</p>
              </div>
            )}

            {mode === 'shop' && !activeShop && shops.map(shop => (
              <ShopRow key={shop.id} shop={shop} onClick={() => void openShop(shop)} />
            ))}

            {(mode === 'product' || activeShop) && !loading && products.length === 0 && (
              <div className="px-3 py-14 text-center">
                <Package className="mx-auto h-8 w-8 text-muted-foreground/40" />
                <div className="mt-3 text-[13px] font-medium text-foreground">No products found</div>
                <p className="mt-1 text-[12px] text-muted-foreground">Adjust filters or pick another shop.</p>
              </div>
            )}

            {(mode === 'product' || activeShop) && products.map(product => (
              <ProductRow
                key={product.id}
                product={product}
                selected={selected?.id === product.id}
                onClick={() => confirmSelect(product)}
              />
            ))}
          </div>

          <aside className="flex flex-col rounded-xl border border-border/80 bg-card p-3 shadow-sm lg:sticky lg:top-0 lg:self-start">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Preview
            </div>

            {selected && selectedPrice
              ? (
                  <div className="mt-3 flex min-h-0 flex-1 flex-col" data-testid="bugsell-selected">
                    <div className="aspect-[4/3] overflow-hidden rounded-lg border border-border/70 bg-muted">
                      {selected.thumbnailUrl
                        ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={selected.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                          )
                        : (
                            <div className="grid h-full place-items-center text-muted-foreground">
                              <Package className="h-8 w-8 opacity-40" />
                            </div>
                          )}
                    </div>
                    <div className="mt-3 space-y-1.5">
                      <div className="text-[13px] font-semibold leading-snug tracking-tight">{selected.name}</div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-[15px] font-semibold tabular-nums">{selectedPrice.current}</span>
                        {selectedPrice.original && (
                          <span className="text-[11px] tabular-nums text-muted-foreground line-through">
                            {selectedPrice.original}
                          </span>
                        )}
                      </div>
                      {(selected.shop?.name || selected.shopName) && (
                        <div className="text-[11px] text-muted-foreground">
                          {selected.shop?.name || selected.shopName}
                          {selected.category?.name ? ` · ${selected.category.name}` : ''}
                        </div>
                      )}
                    </div>
                    <a
                      href={selected.storeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                    >
                      View on storefront
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <div className="mt-auto space-y-2 pt-4">
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        Applies product title, URL, and notes into the generation prompt.
                      </p>
                      <Button
                        type="button"
                        data-testid="bugsell-use-product-btn"
                        className="h-9 w-full rounded-lg"
                        onClick={applySelected}
                      >
                        Use for generation
                      </Button>
                    </div>
                  </div>
                )
              : (
                  <div className="mt-4 flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-10 text-center">
                    <Package className="h-7 w-7 text-muted-foreground/35" />
                    <p className="mt-3 text-[12px] font-medium text-foreground">No product selected</p>
                    <p className="mt-1 max-w-[180px] text-[11px] leading-relaxed text-muted-foreground">
                      {mode === 'shop' && !activeShop
                        ? 'Open a shop, pick a product, then apply it to your prompt.'
                        : 'Select a product from the list to preview and apply.'}
                    </p>
                  </div>
                )}
          </aside>
        </div>
      </div>
    </div>
  )
}
