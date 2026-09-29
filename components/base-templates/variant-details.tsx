"use client"

import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import type { BaseTemplateProductType, BaseTemplateVariant } from "@/types/mera-base-template"
import {
  CATCH_ALL_LABEL,
  conditionLines,
  countriesLabel,
  formatDateTime,
  statusBadgeClass,
  statusLabel,
  statusOf,
} from "./utils"

interface VariantDetailsProps {
  pt: BaseTemplateProductType
  variant: BaseTemplateVariant
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid grid-cols-[88px_1fr] gap-2 text-sm">
    <div className="text-gray-500">{label}</div>
    <div className="text-gray-900 min-w-0 break-words">{children}</div>
  </div>
)

export function VariantDetails({ pt, variant }: VariantDetailsProps) {
  const status = statusOf(variant)
  const lines = conditionLines(variant)
  const pendingValues = variant.pending_values ?? []
  const history = [...(variant.history ?? [])].sort((a, b) => (b.at || "").localeCompare(a.at || ""))
  const approved = variant.approved_signatures ?? []

  return (
    <div className="space-y-4">
      <section className="space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold text-gray-900 truncate">{pt.display_name || pt.slug}</div>
            <div className="text-xs text-gray-500 truncate">
              {pt.project_name || pt.project_id} · {pt.slug}
            </div>
          </div>
          <Badge variant="outline" className={cn("flex-shrink-0", statusBadgeClass(status))}>
            {statusLabel(status)}
          </Badge>
        </div>
        <Row label="Điều kiện">
          {lines.length === 0 ? (
            <span className="italic text-gray-600">{CATCH_ALL_LABEL}</span>
          ) : (
            <ul className="space-y-0.5">
              {lines.map((l, i) => (
                <li key={i}>
                  {i > 0 && <span className="text-[11px] font-semibold text-gray-400 mr-1">HOẶC</span>}
                  {l}
                </li>
              ))}
            </ul>
          )}
        </Row>
        <Row label="Countries">{countriesLabel(variant)}</Row>
        <Row label="Designer">{variant.designer || "—"}</Row>
        <Row label="Đơn chờ">{variant.pending_count ?? 0}</Row>
        <Row label="Link">
          <span className="flex flex-wrap gap-x-3">
            {variant.base_template_design && (
              <a href={variant.base_template_design} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                Design <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {variant.base_template_mockup && (
              <a href={variant.base_template_mockup} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                Mockup <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </span>
        </Row>
      </section>

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
          Giá trị đang chờ ({pendingValues.length})
        </h4>
        {pendingValues.length === 0 ? (
          <div className="text-xs text-gray-500 italic">Không có đơn chờ — duyệt chỉ đổi trạng thái template.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b">
                <th className="text-left font-medium py-1">Giá trị</th>
                <th className="text-right font-medium py-1 w-12">Đơn</th>
                <th className="text-right font-medium py-1 w-28">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {pendingValues.map((pv) => (
                <tr key={pv.signature} className="border-b border-gray-100 align-top">
                  <td className="py-1 pr-2 break-words" title={pv.signature || "(chữ ký rỗng)"}>
                    {pv.label || pv.signature || "(không có trường phân biệt)"}
                  </td>
                  <td className="py-1 text-right tabular-nums">{pv.count}</td>
                  <td className="py-1 text-right">
                    {pv.approved ? (
                      <span className="text-gray-500">đã duyệt – đơn tồn</span>
                    ) : (
                      <span className="font-medium text-amber-700">giá trị mới</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
          Lịch sử ({history.length})
        </h4>
        {history.length === 0 ? (
          <div className="text-xs text-gray-500 italic">Chưa có lịch sử.</div>
        ) : (
          <ol className="space-y-1.5">
            {history.map((h, i) => (
              <li key={`${h.at}-${i}`} className="text-xs border-l-2 border-gray-200 pl-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", statusBadgeClass(h.status))}>
                    {statusLabel(h.status)}
                  </Badge>
                  <span className="text-gray-700">{h.actor_email || "—"}</span>
                  <span className="text-gray-400">{formatDateTime(h.at)}</span>
                </div>
                {h.note && <div className="mt-0.5 text-gray-800 whitespace-pre-wrap">{h.note}</div>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <details>
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-500">
            Giá trị đã duyệt ({approved.length})
          </summary>
          {approved.length === 0 ? (
            <div className="text-xs text-gray-500 italic mt-1">Chưa có.</div>
          ) : (
            <ul className="mt-1 space-y-0.5 max-h-48 overflow-y-auto">
              {approved.map((s) => (
                <li key={s} className="text-[11px] font-mono text-gray-700 break-all">
                  {s || "(chữ ký rỗng)"}
                </li>
              ))}
            </ul>
          )}
        </details>
      </section>
    </div>
  )
}
