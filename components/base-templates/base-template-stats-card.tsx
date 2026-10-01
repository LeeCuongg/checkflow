"use client"

import Link from "next/link"
import { ArrowRight, LayoutTemplate, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useBaseTemplateCounts } from "@/hooks/use-base-template-counts"

// Order Review: base template numbers (every project) to keep an eye on, same counts as
// the sidebar badges.
export function BaseTemplateStatsCard() {
  const { counts, loading, error, refresh } = useBaseTemplateCounts()
  const plus = counts?.partial ? "+" : ""
  const value = (n: number | undefined) => (n === undefined ? "—" : `${n.toLocaleString()}${plus}`)

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <LayoutTemplate className="h-5 w-5 text-gray-600" />
          <h2 className="text-base font-semibold text-gray-900">Base Template</h2>
          <span className="text-xs text-gray-500">tất cả project</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refresh()}
            disabled={loading}
            title="Tải lại số liệu"
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button asChild variant="outline" size="sm" className="border-gray-300">
            <Link href="/base-templates">
              Mở Base Templates
              <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="text-sm text-amber-900">Chờ duyệt có đơn</div>
          <div className="text-2xl font-bold text-amber-700 tabular-nums">{value(counts?.waiting)}</div>
        </div>
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3">
          <div className="text-sm text-red-900">Chờ designer sửa</div>
          <div className="text-2xl font-bold text-red-700 tabular-nums">{value(counts?.repair)}</div>
        </div>
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3">
          <div className="text-sm text-green-900">Đã duyệt</div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-green-700 tabular-nums">{value(counts?.confirmed)}</span>
            {counts && <span className="text-xs text-green-800">hôm nay: {counts.confirmedToday.toLocaleString()}</span>}
          </div>
        </div>
      </div>

      {error && !counts && <div className="mt-2 text-xs text-red-700">Không tải được số liệu base template ({error}).</div>}
    </div>
  )
}
