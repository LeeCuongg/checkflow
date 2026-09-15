"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, Database, Layers } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import type { MeraProject, MeraListOrdersResponse } from "@/types/mera-order"

interface MeraProjectSelectorProps {
  projects: MeraProject[]
  projectsLoading: boolean
  selectedProjectId: string
  onProjectSelect: (projectId: string) => void
  ordersLoading: boolean
  error?: string | null
}

// "" = all projects
const ALL_PROJECTS = ""

const getStatusColor = (status: string) => {
  switch (status.toUpperCase()) {
    case "NEW":
      return "bg-green-100 text-green-700"
    case "DESIGNED":
      return "bg-blue-100 text-blue-800"
    case "NEED_REPAIR":
    case "NEED REPAIR":
      return "bg-red-100 text-red-800"
    case "REPAIRED":
      return "bg-purple-100 text-purple-800"
    case "PENDING":
      return "bg-yellow-100 text-yellow-800"
    case "COMPLETED":
      return "bg-emerald-100 text-emerald-800"
    case "CANCELLED":
      return "bg-red-100 text-red-800"
    default:
      return "bg-gray-100 text-gray-800"
  }
}

const formatLastSync = (timestamp?: string) => {
  if (!timestamp) return "Never"
  const diffMins = Math.floor((Date.now() - new Date(timestamp).getTime()) / (1000 * 60))
  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
  return new Date(timestamp).toLocaleDateString()
}

export function MeraProjectSelector({
  projects,
  projectsLoading,
  selectedProjectId,
  onProjectSelect,
  ordersLoading,
  error,
}: MeraProjectSelectorProps) {
  const { getToken } = useAuth()
  const [statusCounts, setStatusCounts] = useState<Record<string, Record<string, number>>>({})
  const [loadingCounts, setLoadingCounts] = useState<Record<string, boolean>>({})
  const [countErrors, setCountErrors] = useState<Record<string, boolean>>({})
  const [statusLastSync, setStatusLastSync] = useState<string>("")
  const [, setTick] = useState(0)

  // Mera status_counts are item counts scoped by project (status filter excluded),
  // so page_size=1 is enough to get the badges without pulling orders.
  const fetchStatusCounts = useCallback(
    async (projectId: string) => {
      const token = getToken()
      if (!token) return {}
      const sp = new URLSearchParams({ page: "1", page_size: "1" })
      if (projectId) sp.set("project_id", projectId)
      const res = await fetch(`/api/mera/orders?${sp.toString()}`, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: MeraListOrdersResponse = await res.json()
      return data.status_counts ?? {}
    },
    [getToken]
  )

  const loadAllStatusCounts = useCallback(() => {
    const ids = [ALL_PROJECTS, ...projects.map((p) => p.id)]
    setLoadingCounts(Object.fromEntries(ids.map((id) => [id, true])))

    ids.forEach(async (id) => {
      try {
        const counts = await fetchStatusCounts(id)
        setStatusCounts((prev) => ({ ...prev, [id]: counts }))
        setCountErrors((prev) => ({ ...prev, [id]: false }))
      } catch (err) {
        console.error(`[MeraProjectSelector] Error loading status counts for project ${id || "all"}:`, err)
        setCountErrors((prev) => ({ ...prev, [id]: true }))
      } finally {
        setLoadingCounts((prev) => ({ ...prev, [id]: false }))
      }
    })

    setStatusLastSync(new Date().toISOString())
  }, [projects, fetchStatusCounts])

  useEffect(() => {
    if (projectsLoading) return
    loadAllStatusCounts()
  }, [projectsLoading, loadAllStatusCounts])

  // Keep "Xm ago" label fresh
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(timer)
  }, [])

  const isRefreshingStatus = Object.values(loadingCounts).some(Boolean)

  const renderStatusBadges = (projectId: string) => {
    if (loadingCounts[projectId]) {
      return (
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Loading...
        </div>
      )
    }

    if (countErrors[projectId]) {
      return <div className="text-xs text-red-500">Failed to load status</div>
    }

    const counts = statusCounts[projectId]
    const entries = Object.entries(counts ?? {}).filter(([, count]) => count > 0)
    if (entries.length === 0) {
      return <div className="text-xs text-gray-500">No data</div>
    }

    return (
      <div className="flex flex-wrap gap-1">
        {entries
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([status, count]) => (
            <Badge key={status} className={`text-xs px-2 py-1 ${getStatusColor(status)}`}>
              {status}: {count}
            </Badge>
          ))}
      </div>
    )
  }

  const renderCard = (projectId: string, name: string, icon: React.ReactNode) => (
    <Card
      key={projectId || "__all__"}
      className={`p-3 transition-all border-2 cursor-pointer hover:shadow-md ${
        selectedProjectId === projectId ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
      }`}
      onClick={() => onProjectSelect(projectId)}
    >
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="font-medium text-base truncate">{name}</h3>
      </div>
      <div className="mb-2 p-2 bg-gray-50 rounded">{renderStatusBadges(projectId)}</div>
    </Card>
  )

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Select Mera Project</h2>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          {error && <span className="text-sm text-red-500">{error}</span>}
          <span>Status last sync: {formatLastSync(statusLastSync)}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={loadAllStatusCounts}
            disabled={isRefreshingStatus || projectsLoading}
            className="h-8 px-3 border-gray-300 hover:bg-gray-50 bg-transparent"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${isRefreshingStatus ? "animate-spin" : ""}`} />
            Refresh Status
          </Button>
        </div>
      </div>

      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          💡 You can select a project even while status counts are loading. Use the "Refresh Status" button to
          manually sync status counts.
        </p>
      </div>

      <div className="space-y-4">
        {projectsLoading ? (
          <div className="flex items-center justify-center py-8 text-gray-500">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            <span className="text-sm">Loading projects...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {renderCard(ALL_PROJECTS, "All projects", <Layers className="h-4 w-4 text-gray-600" />)}
            {projects.map((p) => renderCard(p.id, p.name, <Database className="h-4 w-4 text-gray-600" />))}
          </div>
        )}

        {ordersLoading && (
          <div className="flex items-center justify-center py-4">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            <span className="text-sm text-gray-600">Loading orders...</span>
          </div>
        )}
      </div>
    </Card>
  )
}
