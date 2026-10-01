"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { logError } from "@/lib/sentry"
import { notifyBaseTemplatesChanged } from "@/hooks/use-base-template-counts"
import {
  BASE_TEMPLATE_PAGE_LIMIT,
  type BaseTemplateActionResult,
  type BaseTemplateListResponse,
  type BaseTemplateProductType,
  type BaseTemplateSettings,
  type CheckflowBaseTemplateConfirmRequest,
  type CheckflowBaseTemplateNeedRepairRequest,
} from "@/types/mera-base-template"

export type BaseTemplateActionOutcome =
  | { ok: true; data: BaseTemplateActionResult }
  | { ok: false; status: number; body: { error?: string; code?: string; current_status?: string; message?: string } }

interface Options {
  projectId: string // "" = all projects
  search: string
  // false = hold off loading (e.g. until the saved project filter has been read back).
  enabled?: boolean
}

export function useMeraBaseTemplates({ projectId, search, enabled = true }: Options) {
  const { user, getToken, signOut } = useAuth()
  const [queue, setQueue] = useState<BaseTemplateProductType[]>([])
  const [queueTotal, setQueueTotal] = useState(0)
  const [repair, setRepair] = useState<BaseTemplateProductType[]>([])
  const [repairTotal, setRepairTotal] = useState(0)
  const [confirmed, setConfirmed] = useState<BaseTemplateProductType[]>([])
  const [confirmedTotal, setConfirmedTotal] = useState(0)
  const [settings, setSettings] = useState<BaseTemplateSettings | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestSeq = useRef(0)
  // signOut is not memoized in AuthProvider; keep it out of the dependency chain so the
  // list is not refetched every time the provider re-renders.
  const signOutRef = useRef(signOut)
  signOutRef.current = signOut

  const call = useCallback(
    async (url: string, init?: { method: "POST"; body: unknown }) => {
      const token = getToken()
      if (!token) throw new Error("Not authenticated")
      const res = await fetch(url, {
        method: init?.method ?? "GET",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: init ? JSON.stringify(init.body) : undefined,
      })
      if (res.status === 401) {
        await signOutRef.current()
        throw new Error("Phiên đăng nhập đã hết hạn")
      }
      const payload = await res.json().catch(() => ({}))
      return { res, payload }
    },
    [getToken]
  )

  const listUrl = useCallback(
    (extra: Record<string, string>) => {
      const sp = new URLSearchParams({ limit: String(BASE_TEMPLATE_PAGE_LIMIT), ...extra })
      if (projectId) sp.set("project_id", projectId)
      if (search.trim()) sp.set("search", search.trim())
      return `/api/mera/base-templates?${sp.toString()}`
    },
    [projectId, search]
  )

  const refetch = useCallback(
    async (opts?: { nocache?: boolean }) => {
      if (!user || !enabled) return
      const seq = ++requestSeq.current
      const nc: Record<string, string> = opts?.nocache ? { nocache: "true" } : {}
      setLoading(true)
      setError(null)

      const settingsP = call("/api/mera/base-template-settings")
        .then(({ res, payload }) => {
          if (seq !== requestSeq.current) return
          if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`)
          setSettings(payload as BaseTemplateSettings)
          setSettingsError(null)
        })
        .catch((err) => {
          if (seq !== requestSeq.current) return
          setSettingsError((err as Error).message)
        })

      try {
        const [q, r, c] = await Promise.all([
          call(listUrl({ queue: "true", ...nc })),
          call(listUrl({ status: "NEED REPAIR", ...nc })),
          call(listUrl({ status: "CONFIRMED", ...nc })),
        ])
        if (seq !== requestSeq.current) return
        if (!q.res.ok) throw new Error(q.payload.error || `HTTP ${q.res.status}`)
        const qData = q.payload as BaseTemplateListResponse
        setQueue(qData.items ?? [])
        setQueueTotal(qData.total ?? 0)
        if (r.res.ok) {
          const rData = r.payload as BaseTemplateListResponse
          setRepair(rData.items ?? [])
          setRepairTotal(rData.total ?? 0)
        } else {
          setRepair([])
          setRepairTotal(0)
        }
        if (c.res.ok) {
          const cData = c.payload as BaseTemplateListResponse
          setConfirmed(cData.items ?? [])
          setConfirmedTotal(cData.total ?? 0)
        } else {
          setConfirmed([])
          setConfirmedTotal(0)
        }
      } catch (err) {
        if (seq !== requestSeq.current) return
        const message = (err as Error).message || "Không tải được danh sách base template"
        setError(message)
        logError(err as Error, { context: "useMeraBaseTemplates.refetch" })
      } finally {
        await settingsP
        if (seq === requestSeq.current) setLoading(false)
      }
    },
    [user, enabled, call, listUrl]
  )

  useEffect(() => {
    // Every load reads fresh: checkflow may sit behind a different Mera instance than the one
    // that took the last write (the page or another checker), so its 60s cache can be stale.
    refetch({ nocache: true })
  }, [refetch])

  const runAction = useCallback(
    async (url: string, body: unknown): Promise<BaseTemplateActionOutcome> => {
      const { res, payload } = await call(url, { method: "POST", body })
      // Success or conflict alike, some template state moved — sidebar / card counts reload.
      notifyBaseTemplatesChanged()
      if (res.ok) return { ok: true, data: payload as BaseTemplateActionResult }
      return { ok: false, status: res.status, body: payload ?? {} }
    },
    [call]
  )

  const confirm = useCallback(
    (req: CheckflowBaseTemplateConfirmRequest) => runAction("/api/mera/base-templates/confirm", req),
    [runAction]
  )

  const needRepair = useCallback(
    (req: CheckflowBaseTemplateNeedRepairRequest) => runAction("/api/mera/base-templates/need-repair", req),
    [runAction]
  )

  return {
    queue,
    queueTotal,
    repair,
    repairTotal,
    confirmed,
    confirmedTotal,
    settings,
    settingsError,
    loading,
    error,
    refetch,
    confirm,
    needRepair,
  }
}
