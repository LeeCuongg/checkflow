"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useAuth } from "@/contexts/auth-context"
import { logError } from "@/lib/sentry"
import type { MeraListOrdersParams, MeraListOrdersResponse, MeraOrder } from "@/types/mera-order"

interface UseMeraOrdersResult {
  orders: MeraOrder[]
  total: number
  page: number
  page_size: number
  total_pages: number
  status_counts: Record<string, number>
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useMeraOrders(params: MeraListOrdersParams, options?: { enabled?: boolean }): UseMeraOrdersResult {
  const enabled = options?.enabled ?? true
  const [result, setResult] = useState<MeraListOrdersResponse>({
    orders: [],
    total: 0,
    page: 1,
    page_size: 50,
    total_pages: 0,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { user, getToken } = useAuth()
  const paramsRef = useRef(params)
  paramsRef.current = params
  const requestSeq = useRef(0)
  const columnFiltersKey =
    params.column_filters && Object.keys(params.column_filters).length > 0
      ? JSON.stringify(params.column_filters)
      : ""

  const fetchOrders = useCallback(async () => {
    const token = getToken()
    if (!user || !token) {
      setLoading(false)
      return
    }
    // Filters change while the user types: only the newest request may write its answer,
    // or a slow older one would put back the list of a previous search.
    const seq = ++requestSeq.current

    try {
      setLoading(true)
      setError(null)

      const sp = new URLSearchParams()
      const p = paramsRef.current
      if (p.page) sp.set("page", String(p.page))
      if (p.page_size) sp.set("page_size", String(p.page_size))
      if (p.channel) sp.set("channel", p.channel)
      if (p.status) sp.set("status", p.status)
      if (p.statuses?.length) p.statuses.forEach((s) => sp.append("statuses", s))
      if (p.store) sp.set("store", p.store)
      if (p.provider) sp.set("provider", p.provider)
      if (p.designer) sp.set("designer", p.designer)
      if (p.project_id) sp.set("project_id", p.project_id)
      if (p.q) sp.set("q", p.q)
      if (p.include_items) sp.set("include_items", "true")
      if (p.column_filters && Object.keys(p.column_filters).length > 0) {
        sp.set("column_filters", JSON.stringify(p.column_filters))
      }

      const res = await fetch(`/api/mera/orders?${sp.toString()}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      const data: MeraListOrdersResponse = await res.json()
      if (seq !== requestSeq.current) return
      setResult(data)
    } catch (err) {
      if (seq !== requestSeq.current) return
      const message = err instanceof Error ? err.message : "Failed to load orders"
      setError(message)
      logError(err as Error, { context: "useMeraOrders" })
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [user, getToken])

  useEffect(() => {
    if (enabled && user) fetchOrders()
    else setLoading(false)
  }, [
    fetchOrders,
    user,
    enabled,
    params.page,
    params.page_size,
    params.project_id,
    params.status,
    params.statuses?.join(","),
    params.store,
    params.channel,
    params.provider,
    params.designer,
    params.q,
    params.include_items,
    columnFiltersKey,
  ])

  return { ...result, status_counts: result.status_counts ?? {}, loading, error, refetch: fetchOrders }
}
