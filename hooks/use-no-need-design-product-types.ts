"use client"

import { useCallback, useEffect, useSyncExternalStore } from "react"
import { useAuth } from "@/contexts/auth-context"
import { logError } from "@/lib/sentry"
import type { Order } from "@/types/order"
import type { BaseTemplateListResponse } from "@/types/mera-base-template"

// Recognises NO NEED DESIGN orders (product type `need_customer_design = no`, fulfilled from a
// BASE TEMPLATE) on the /review screen. There is no flag on the item, so the list comes from
// Mera `GET /api/v1/base-templates` (proxy /api/mera/base-templates), which returns ONLY active
// product types with need_customer_design = "no" that carry a base template.
//
// The list is loaded once per session (all pages) into a module-level store shared by every
// component (modal + every list row), cached 5 minutes. While it is loading or after an error
// nothing is flagged — callers must never block an action on an unknown answer.

const PAGE_LIMIT = 200
const MAX_PAGES = 50 // safety stop against a misbehaving total_pages
const CACHE_TTL_MS = 5 * 60 * 1000
const ERROR_RETRY_MS = 30 * 1000

export interface NoNeedDesignProductType {
  projectId: string
  slug: string
  displayName: string
}

interface StoreState {
  // key `${project_id}|${slug}` → product type
  byKey: ReadonlyMap<string, NoNeedDesignProductType>
  loaded: boolean // at least one successful load
  loading: boolean
  error: string | null
}

let state: StoreState = { byKey: new Map(), loaded: false, loading: false, error: null }
let lastAttemptAt = 0
let lastSuccessAt = 0
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

function setState(patch: Partial<StoreState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  return state
}

export function noNeedDesignKey(projectId: string, slug: string) {
  return `${projectId}|${slug}`
}

function isStale(now: number) {
  // A failed (re)load only retries after a short pause, so every list row mounting after a
  // failure does not hammer Mera.
  if (state.error) return now - lastAttemptAt > ERROR_RETRY_MS
  return !state.loaded || now - lastSuccessAt > CACHE_TTL_MS
}

async function fetchAll(token: string) {
  const byKey = new Map<string, NoNeedDesignProductType>()
  let page = 1
  let totalPages = 1
  do {
    const sp = new URLSearchParams({ limit: String(PAGE_LIMIT), page: String(page) })
    const res = await fetch(`/api/mera/base-templates?${sp.toString()}`, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((payload as { error?: string }).error || `HTTP ${res.status}`)
    const data = payload as BaseTemplateListResponse
    for (const pt of data.items ?? []) {
      if (!pt.project_id || !pt.slug) continue
      byKey.set(noNeedDesignKey(pt.project_id, pt.slug), {
        projectId: pt.project_id,
        slug: pt.slug,
        displayName: pt.display_name || pt.slug,
      })
    }
    totalPages = data.total_pages ?? 1
    page++
  } while (page <= totalPages && page <= MAX_PAGES)
  return byKey
}

function ensureLoaded(getToken: () => string | null) {
  const now = Date.now()
  if (inflight || !isStale(now)) return
  const token = getToken()
  if (!token) return
  lastAttemptAt = now
  setState({ loading: true })
  inflight = fetchAll(token)
    .then((byKey) => {
      lastSuccessAt = Date.now()
      setState({ byKey, loaded: true, loading: false, error: null })
    })
    .catch((err) => {
      const message = (err as Error)?.message || "Không tải được danh sách product type NO NEED DESIGN"
      console.error("[useNoNeedDesignProductTypes] load failed:", err)
      logError(err as Error, { context: "useNoNeedDesignProductTypes.load" })
      // Keep the last good list (if any): a stale answer beats flagging nothing.
      setState({ loading: false, error: message })
    })
    .finally(() => {
      inflight = null
    })
}

type MaybeMeraOrder = Order & { _mera?: { project_id?: string } }

export function isMeraOrder(order: Order | null | undefined): boolean {
  if (!order) return false
  return order.sheetId === "__mera__" || !!(order as MaybeMeraOrder)._mera
}

// Pure lookup against a given map (exported for callers that already hold the map).
export function findNoNeedDesignProductType(
  byKey: ReadonlyMap<string, NoNeedDesignProductType>,
  order: Order | null | undefined
): NoNeedDesignProductType | null {
  if (!order || !isMeraOrder(order) || !order.productType) return null
  const projectId = (order as MaybeMeraOrder)._mera?.project_id
  if (!projectId) return null
  return byKey.get(noNeedDesignKey(projectId, order.productType)) ?? null
}

export function useNoNeedDesignProductTypes({ enabled = true }: { enabled?: boolean } = {}) {
  const { user, getToken } = useAuth()
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    if (!enabled || !user) return
    ensureLoaded(getToken)
  }, [enabled, user, getToken])

  // Product type of a NO NEED DESIGN order, or null (not Mera / not NO NEED DESIGN / unknown yet).
  const lookup = useCallback(
    (order: Order | null | undefined) => (enabled ? findNoNeedDesignProductType(snapshot.byKey, order) : null),
    [enabled, snapshot.byKey]
  )

  const isNoNeedDesignOrder = useCallback((order: Order | null | undefined) => lookup(order) !== null, [lookup])

  return {
    lookup,
    isNoNeedDesignOrder,
    loaded: snapshot.loaded,
    loading: snapshot.loading,
    error: snapshot.error,
  }
}
