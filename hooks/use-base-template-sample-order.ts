"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { adaptMeraOrderWithItem } from "@/lib/mera-adapter"
import type { Order } from "@/types/order"
import type { MeraListOrdersResponse } from "@/types/mera-order"
import type { BaseTemplateVariant } from "@/types/mera-base-template"

// One real order of a variant, used only for the details that live on orders and not on
// the product type: store / channel / shop / listing link / country. Loaded lazily when the
// review modal shows the variant; failures degrade to "N/A" and never block the review.

export interface SampleOrderState {
  sampleItemKey: string
  order: Order | null
  loading: boolean
  error: string | null
}

// Per-variant cache for the page's lifetime (null = looked up, no matching order).
const cache = new Map<string, Order | null>()

export const sampleItemKeyOf = (v: BaseTemplateVariant): string =>
  (v.pending_values?.find((p) => p.sample_item_key)?.sample_item_key || v.pending_item_key || "").trim()

// Mera treats `q` as a regular expression.
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// A variant with nothing waiting has no sample_item_key. Store / listing live on the orders
// of the product type, so fall back to any order of it — the one using this variant's design
// link first — found by an anchored product_type match.
export function useBaseTemplateSampleOrder(
  cacheKey: string | null,
  projectId: string,
  sampleItemKey: string,
  productType = "",
  designLink = ""
): SampleOrderState {
  const { user, getToken } = useAuth()
  const lookup = sampleItemKey || productType
  const fullKey = cacheKey && lookup ? `${cacheKey}|${sampleItemKey || `pt:${productType}`}` : ""
  const [state, setState] = useState<{ key: string; order: Order | null; loading: boolean; error: string | null }>({
    key: "",
    order: null,
    loading: false,
    error: null,
  })

  useEffect(() => {
    if (!fullKey || !lookup || !projectId || !user) return
    if (cache.has(fullKey)) {
      setState({ key: fullKey, order: cache.get(fullKey) ?? null, loading: false, error: null })
      return
    }

    let cancelled = false
    setState({ key: fullKey, order: null, loading: true, error: null })

    const run = async () => {
      const token = getToken()
      if (!token) throw new Error("Not authenticated")
      const sp = new URLSearchParams({
        project_id: projectId,
        q: sampleItemKey ? escapeRegex(sampleItemKey) : `^${escapeRegex(productType)}$`,
        include_items: "true",
        page_size: sampleItemKey ? "5" : "20",
      })
      const res = await fetch(`/api/mera/orders?${sp.toString()}`, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data = (await res.json()) as MeraListOrdersResponse
      const orders = data.orders ?? []
      if (sampleItemKey) {
        for (const order of orders) {
          const item = order.items?.find((it) => it.item_key === sampleItemKey)
          if (item) return adaptMeraOrderWithItem(order, item)
        }
        return null
      }
      // Fallback: an item of this product type. Rank: on this variant's design link first, then
      // one that carries a Material (the SKU of an Amazon order) — the details it feeds are
      // store / listing / SKU.
      const link = designLink.trim()
      let best: { rank: number; order: ReturnType<typeof adaptMeraOrderWithItem> } | null = null
      for (const order of orders) {
        for (const item of order.items ?? []) {
          if (item.product_type !== productType) continue
          const rank =
            (link && (item.design_link || "").trim() === link ? 2 : 0) + ((item.material || "").trim() ? 1 : 0)
          if (!best || rank > best.rank) best = { rank, order: adaptMeraOrderWithItem(order, item) }
          if (rank === 3) return best.order
        }
      }
      return best?.order ?? null
    }

    run()
      .then((order) => {
        cache.set(fullKey, order)
        if (!cancelled) setState({ key: fullKey, order, loading: false, error: null })
      })
      .catch((err) => {
        // Not cached: the next open of this variant retries.
        if (!cancelled) setState({ key: fullKey, order: null, loading: false, error: (err as Error).message })
      })

    return () => {
      cancelled = true
    }
  }, [fullKey, lookup, sampleItemKey, productType, designLink, projectId, user, getToken])

  if (state.key === fullKey && fullKey) {
    return { sampleItemKey, order: state.order, loading: state.loading, error: state.error }
  }
  // First render for this variant (effect not run yet): serve the cache synchronously.
  if (fullKey && cache.has(fullKey)) {
    return { sampleItemKey, order: cache.get(fullKey) ?? null, loading: false, error: null }
  }
  return { sampleItemKey, order: null, loading: !!(fullKey && projectId && user), error: null }
}
