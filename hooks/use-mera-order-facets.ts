"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useAuth } from "@/contexts/auth-context"
import { logError } from "@/lib/sentry"
import { MERA_FACET_FIELDS, type MeraFacetFilters, type MeraFacets } from "@/types/mera-order"

// Filter options of Order Review (designer / product type / store), computed by Mera over
// every order matching `filters` — not over the page that happens to be loaded.
// `facets` is null until the first answer (and after a failure), so the caller can fall back.
export function useMeraOrderFacets(filters: MeraFacetFilters, options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true
  const [facets, setFacets] = useState<MeraFacets | null>(null)
  const { user, getToken } = useAuth()
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const requestSeq = useRef(0)
  const filtersKey = JSON.stringify(filters)

  const fetchFacets = useCallback(async () => {
    const token = getToken()
    if (!user || !token) return
    const seq = ++requestSeq.current

    try {
      const res = await fetch("/api/mera/orders/facet-values", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ fields: MERA_FACET_FIELDS, ...filtersRef.current }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      const data: { facets: MeraFacets } = await res.json()
      // A slower, older answer must not overwrite the one for the current filters
      if (seq === requestSeq.current) setFacets(data.facets)
    } catch (err) {
      if (seq === requestSeq.current) setFacets(null)
      logError(err as Error, { context: "useMeraOrderFacets" })
    }
  }, [user, getToken])

  useEffect(() => {
    if (enabled && user) fetchFacets()
  }, [fetchFacets, user, enabled, filtersKey])

  return { facets, refetch: fetchFacets }
}
