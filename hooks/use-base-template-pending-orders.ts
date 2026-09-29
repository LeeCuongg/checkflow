"use client"

import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { adaptMeraOrderWithItem } from "@/lib/mera-adapter"
import type { Order } from "@/types/order"
import type { MeraListOrdersResponse, MeraOrder } from "@/types/mera-order"
import { BASE_TEMPLATE_PENDING_STATUSES } from "@/types/mera-base-template"

// The orders currently waiting on one base template variant, so the reviewer can check them
// right in the review modal. "Waiting" = the same definition the Mera list uses for
// pending_count: item.product_type === slug, item.design_link === variant design link (trimmed),
// item.status in BASE_TEMPLATE_PENDING_STATUSES, same project.
//
// Mera `GET /api/v2/orders` applies `q` (a regex, matched against the item product_type among
// others) and `statuses` as SEPARATE conditions, so an order can come back because another of
// its items matched one of them — every item is re-checked here.

export type PendingOrder = Order & { _mera: MeraOrder }

export interface PendingOrdersState {
  orders: PendingOrder[]
  loading: boolean
  error: string | null
  // Waiting items that could not be loaded within the page cap (pending_count − loaded).
  remaining: number
  reload: () => void
}

const PAGE_SIZE = 200
const MAX_PAGES = 5
const CACHE_TTL_MS = 60_000

interface CacheEntry {
  orders: PendingOrder[]
  exhausted: boolean
  at: number
}

// Keyed by variant key + pending_count + status: a list refetch that changes either
// (confirm / need repair / new orders) loads again; an unchanged variant reuses it for 60s.
const cache = new Map<string, CacheEntry>()

// Mera treats `q` as a regular expression.
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const PENDING = new Set<string>(BASE_TEMPLATE_PENDING_STATUSES)

const newestFirst = (a: PendingOrder, b: PendingOrder) => (b.date || "").localeCompare(a.date || "")

export function useBaseTemplatePendingOrders(
  variantKey: string | null,
  projectId: string,
  productType: string,
  designLink: string,
  pendingCount: number,
  status: string
): PendingOrdersState {
  const { user, getToken } = useAuth()
  const link = designLink.trim()
  const enabled = !!(variantKey && projectId && productType && link && pendingCount > 0)
  const fullKey = enabled ? `${variantKey}|${pendingCount}|${status}` : ""
  const [nonce, setNonce] = useState(0)
  const [state, setState] = useState<{ key: string; entry: CacheEntry | null; loading: boolean; error: string | null }>(
    { key: "", entry: null, loading: false, error: null }
  )

  const reload = useCallback(() => {
    if (fullKey) cache.delete(fullKey)
    setNonce((n) => n + 1)
  }, [fullKey])

  useEffect(() => {
    if (!fullKey || !user) return
    const hit = cache.get(fullKey)
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      setState({ key: fullKey, entry: hit, loading: false, error: null })
      return
    }

    let cancelled = false
    const controller = new AbortController()
    setState({ key: fullKey, entry: null, loading: true, error: null })

    const run = async (): Promise<CacheEntry> => {
      const token = getToken()
      if (!token) throw new Error("Not authenticated")
      const seen = new Set<string>()
      const out: PendingOrder[] = []
      let exhausted = false
      for (let page = 1; page <= MAX_PAGES; page++) {
        const sp = new URLSearchParams({
          project_id: projectId,
          q: `^${escapeRegex(productType)}$`,
          include_items: "true",
          page: String(page),
          page_size: String(PAGE_SIZE),
        })
        for (const s of BASE_TEMPLATE_PENDING_STATUSES) sp.append("statuses", s)
        const res = await fetch(`/api/mera/orders?${sp.toString()}`, {
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        const data = (await res.json()) as MeraListOrdersResponse
        const orders = data.orders ?? []
        for (const order of orders) {
          if (order.project_id && order.project_id !== projectId) continue
          for (const item of order.items ?? []) {
            if (item.product_type !== productType) continue
            if ((item.design_link || "").trim() !== link) continue
            if (!PENDING.has((item.status || "").trim())) continue
            if (seen.has(item.item_key)) continue
            seen.add(item.item_key)
            out.push(adaptMeraOrderWithItem(order, item))
          }
        }
        const totalPages = data.total_pages || 1
        if (page >= totalPages || orders.length < PAGE_SIZE) {
          exhausted = true
          break
        }
        if (out.length >= pendingCount) break
      }
      out.sort(newestFirst)
      return { orders: out, exhausted, at: Date.now() }
    }

    run()
      .then((entry) => {
        cache.set(fullKey, entry)
        if (!cancelled) setState({ key: fullKey, entry, loading: false, error: null })
      })
      .catch((err) => {
        if (cancelled) return
        // Not cached: the next open / reload retries.
        setState({ key: fullKey, entry: null, loading: false, error: (err as Error).message })
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [fullKey, nonce, projectId, productType, link, pendingCount, user, getToken])

  const remainingOf = (entry: CacheEntry) =>
    entry.exhausted ? 0 : Math.max(0, pendingCount - entry.orders.length)

  if (!fullKey) return { orders: [], loading: false, error: null, remaining: 0, reload }
  if (state.key === fullKey) {
    return {
      orders: state.entry?.orders ?? [],
      loading: state.loading,
      error: state.error,
      remaining: state.entry ? remainingOf(state.entry) : 0,
      reload,
    }
  }
  // First render for this variant (effect not run yet): serve a fresh cache hit synchronously.
  const hit = cache.get(fullKey)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { orders: hit.orders, loading: false, error: null, remaining: remainingOf(hit), reload }
  }
  return { orders: [], loading: !!user, error: null, remaining: 0, reload }
}
