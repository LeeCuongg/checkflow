"use client"

import { useEffect, useRef, useSyncExternalStore } from "react"
import { useAuth } from "@/contexts/auth-context"
import type { BaseTemplateCounts } from "@/components/base-templates/utils"

// Base template counts for every project, shared by the sidebar and the Order Review card:
// one module-level store, so two mounted consumers make one request.
//
// Polls through Mera's 60s list cache; after a confirm / need-repair / manual refresh the
// /base-templates page calls notifyBaseTemplatesChanged() and every consumer reloads
// bypassing that cache.

const POLL_MS = 60_000
const CHANGED_EVENT = "base-templates:changed"

interface CountsState {
  counts: BaseTemplateCounts | null
  error: string | null
  loading: boolean
}

let state: CountsState = { counts: null, error: null, loading: false }
let lastLoadedAt = 0
let inflight: { promise: Promise<void>; nocache: boolean } | null = null
const listeners = new Set<() => void>()

function setState(patch: Partial<CountsState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getSnapshot = () => state

async function fetchCounts(token: string, nocache: boolean) {
  setState({ loading: true })
  try {
    const res = await fetch(`/api/mera/base-templates/counts${nocache ? "?nocache=true" : ""}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`)
    lastLoadedAt = Date.now()
    setState({ counts: payload as BaseTemplateCounts, error: null, loading: false })
  } catch (err) {
    // Keep the last numbers on screen; the next poll retries.
    setState({ error: (err as Error).message, loading: false })
  }
}

function loadCounts(getToken: () => string | null, nocache: boolean): Promise<void> {
  // A cached load already running cannot answer a "something just changed" request.
  if (inflight && (inflight.nocache || !nocache)) return inflight.promise
  if (!nocache && Date.now() - lastLoadedAt < POLL_MS / 2) return Promise.resolve()
  const token = getToken()
  if (!token) return Promise.resolve()

  const promise = (inflight?.promise ?? Promise.resolve())
    .then(() => fetchCounts(token, nocache))
    .finally(() => {
      if (inflight?.promise === promise) inflight = null
    })
  inflight = { promise, nocache }
  return promise
}

// Tell every mounted consumer that base template states changed.
export function notifyBaseTemplatesChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED_EVENT))
}

export function useBaseTemplateCounts() {
  const { user, getToken } = useAuth()
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const getTokenRef = useRef(getToken)
  getTokenRef.current = getToken

  useEffect(() => {
    if (!user) return
    const load = (nocache = false) => void loadCounts(() => getTokenRef.current(), nocache)

    load()
    const timer = setInterval(() => {
      if (!document.hidden) load()
    }, POLL_MS)
    const onChanged = () => load(true)
    const onVisible = () => {
      if (!document.hidden) load()
    }
    window.addEventListener(CHANGED_EVENT, onChanged)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(timer)
      window.removeEventListener(CHANGED_EVENT, onChanged)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [user])

  return {
    ...snapshot,
    refresh: () => loadCounts(() => getTokenRef.current(), true),
  }
}
