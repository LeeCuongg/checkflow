"use client"

import { useState, useCallback } from "react"
import { useAuth } from "@/contexts/auth-context"
import { logError } from "@/lib/sentry"
import { toast } from "@/hooks/use-toast"
import type {
  MeraBulkPatchItemsBody,
  MeraOrder,
  MeraOrderItem,
  MeraPatchItemBody,
  MeraPatchOrderBody,
} from "@/types/mera-order"

interface VersionConflictError {
  isVersionConflict: true
  latest: MeraOrder | MeraOrderItem
}

async function fetchMera<T>(
  url: string,
  token: string,
  body: unknown
): Promise<{ ok: true; data: T } | { ok: false; status: number; payload: unknown }> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  const payload = await res.json().catch(() => ({}))
  if (res.ok) return { ok: true, data: payload as T }
  return { ok: false, status: res.status, payload }
}

export function useMeraMutations() {
  const [loading, setLoading] = useState(false)
  const { getToken } = useAuth()

  const patchOrder = useCallback(
    async (orderId: string, body: MeraPatchOrderBody): Promise<MeraOrder> => {
      const token = getToken()
      if (!token) throw new Error("Not authenticated")

      setLoading(true)
      try {
        const result = await fetchMera<MeraOrder>(
          `/api/mera/orders/${encodeURIComponent(orderId)}`,
          token,
          body
        )
        if (result.ok) return result.data

        if (result.status === 409) {
          const err: VersionConflictError = {
            isVersionConflict: true,
            latest: (result.payload as { latest: MeraOrder }).latest,
          }
          throw Object.assign(new Error("version_conflict"), err)
        }
        throw new Error((result.payload as { error?: string }).error || `HTTP ${result.status}`)
      } catch (err) {
        logError(err as Error, { context: "useMeraMutations.patchOrder", orderId })
        throw err
      } finally {
        setLoading(false)
      }
    },
    [getToken]
  )

  const patchItem = useCallback(
    async (itemKey: string, body: MeraPatchItemBody): Promise<MeraOrderItem> => {
      const token = getToken()
      if (!token) throw new Error("Not authenticated")

      setLoading(true)
      try {
        const result = await fetchMera<MeraOrderItem>(
          `/api/mera/order-items/${encodeURIComponent(itemKey)}`,
          token,
          body
        )
        if (result.ok) return result.data

        if (result.status === 409) {
          const err: VersionConflictError = {
            isVersionConflict: true,
            latest: (result.payload as { latest: MeraOrderItem }).latest,
          }
          throw Object.assign(new Error("version_conflict"), err)
        }
        throw new Error((result.payload as { error?: string }).error || `HTTP ${result.status}`)
      } catch (err) {
        logError(err as Error, { context: "useMeraMutations.patchItem", itemKey })
        throw err
      } finally {
        setLoading(false)
      }
    },
    [getToken]
  )

  const bulkPatchItems = useCallback(
    async (orderId: string, body: MeraBulkPatchItemsBody): Promise<{ items: MeraOrderItem[] }> => {
      const token = getToken()
      if (!token) throw new Error("Not authenticated")

      setLoading(true)
      try {
        const result = await fetchMera<{ items: MeraOrderItem[] }>(
          `/api/mera/orders/${encodeURIComponent(orderId)}/items/bulk`,
          token,
          body
        )
        if (result.ok) return result.data

        if (result.status === 409) {
          toast({ title: "Trạng thái đơn trên mera đã thay đổi", variant: "destructive" })
          const err: VersionConflictError = {
            isVersionConflict: true,
            latest: (result.payload as { items: MeraOrderItem[] }).items as unknown as MeraOrderItem,
          }
          throw Object.assign(new Error("version_conflict"), err)
        }
        throw new Error((result.payload as { error?: string }).error || `HTTP ${result.status}`)
      } catch (err) {
        logError(err as Error, { context: "useMeraMutations.bulkPatchItems", orderId })
        throw err
      } finally {
        setLoading(false)
      }
    },
    [getToken]
  )

  return { patchOrder, patchItem, bulkPatchItems, loading }
}
