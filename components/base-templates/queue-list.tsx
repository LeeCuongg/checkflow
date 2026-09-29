"use client"

import { useEffect, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  type QueueEntry,
  conditionSummary,
  countriesLabel,
  hasNewValues,
  statusBadgeClass,
  statusOf,
} from "./utils"

interface QueueListProps {
  entries: QueueEntry[]
  selectedKey: string | null
  onSelect: (key: string) => void
  emptyText: string
  showProject: boolean
}

export function QueueList({ entries, selectedKey, onSelect, emptyText, showProject }: QueueListProps) {
  const selectedRef = useRef<HTMLButtonElement>(null)

  // Keep the active row visible while Space/Shift+Space walks the queue.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" })
  }, [selectedKey])

  if (entries.length === 0) {
    return <div className="p-6 text-center text-sm text-gray-500">{emptyText}</div>
  }

  return (
    <ul className="divide-y divide-gray-100">
      {entries.map(({ key, pt, variant }) => {
        const status = statusOf(variant)
        const active = key === selectedKey
        return (
          <li key={key}>
            <button
              ref={active ? selectedRef : undefined}
              type="button"
              onClick={() => onSelect(key)}
              className={cn(
                "w-full text-left px-3 py-2.5 transition-colors focus:outline-none",
                active ? "bg-blue-50 border-l-4 border-blue-500" : "border-l-4 border-transparent hover:bg-gray-50"
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-sm text-gray-900 truncate">{pt.display_name || pt.slug}</span>
                {showProject && pt.project_name && (
                  <span className="text-[11px] text-gray-400 truncate">· {pt.project_name}</span>
                )}
              </div>
              <div className="text-xs text-gray-600 mt-0.5 line-clamp-2" title={conditionSummary(variant)}>
                {conditionSummary(variant)}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">{countriesLabel(variant)}</div>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {variant.pending_count > 0 && (
                  <Badge variant="outline" className="text-[11px] px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200">
                    {variant.pending_count} đơn chờ
                  </Badge>
                )}
                {hasNewValues(variant) && (
                  <Badge variant="outline" className="text-[11px] px-1.5 py-0 bg-amber-50 text-amber-800 border-amber-300">
                    có giá trị mới
                  </Badge>
                )}
                {status === "REPAIRED" && (
                  <Badge variant="outline" className={cn("text-[11px] px-1.5 py-0", statusBadgeClass(status))}>
                    REPAIRED — xem bản sửa
                  </Badge>
                )}
                {status === "CONFIRMED" && (
                  <Badge variant="outline" className={cn("text-[11px] px-1.5 py-0", statusBadgeClass(status))}>
                    CONFIRMED
                  </Badge>
                )}
                {status === "NEED REPAIR" && (
                  <Badge variant="outline" className={cn("text-[11px] px-1.5 py-0", statusBadgeClass(status))}>
                    NEED REPAIR
                  </Badge>
                )}
                {status === "" && (
                  <Badge variant="outline" className={cn("text-[11px] px-1.5 py-0", statusBadgeClass(status))}>
                    Chưa duyệt
                  </Badge>
                )}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
