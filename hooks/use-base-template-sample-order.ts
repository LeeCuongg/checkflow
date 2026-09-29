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

export function useBaseTemplateSampleOrder(
  cacheKey: string | null,
  projectId: string,
  sampleItemKey: string
): SampleOrderState {
  const { user, getToken } = useAuth()
  const fullKey = cacheKey ? `${cacheKey}|${sampleItemKey}` : ""
  const [state, setState] = useState<{ key: string; order: Order | null; loading: boolean; error: string | null }>({
    key: "",
    order: null,
    loading: false,
    error: null,
  })

  useEffect(() => {
    if (!fullKey || !sampleItemKey || !projectId || !user) return
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
        q: escapeRegex(sampleItemKey),
        include_items: "true",
        page_size: "5",
      })
      const res = await fetch(`/api/mera/orders?${sp.toString()}`, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data = (await res.json()) as MeraListOrdersResponse
      for (const order of data.orders ?? []) {
        const item = order.items?.find((it) => it.item_key === sampleItemKey)
        if (item) return adaptMeraOrderWithItem(order, item)
      }
      return null
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
  }, [fullKey, sampleItemKey, projectId, user, getToken])

  if (state.key === fullKey && fullKey) {
    return { sampleItemKey, order: state.order, loading: state.loading, error: state.error }
  }
  // First render for this variant (effect not run yet): serve the cache synchronously.
  if (fullKey && cache.has(fullKey)) {
    return { sampleItemKey, order: cache.get(fullKey) ?? null, loading: false, error: null }
  }
  return { sampleItemKey, order: null, loading: !!(fullKey && sampleItemKey && projectId && user), error: null }
}
