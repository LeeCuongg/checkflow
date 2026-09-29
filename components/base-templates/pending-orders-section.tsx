"use client"

import { type CSSProperties, useState } from "react"
import { CheckCheck, Copy, ExternalLink, Loader2, Package, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LazyImage } from "@/components/ui/lazy-image"
import { listingUrl, listingUrlTitle } from "@/lib/listing-url"
import { formatDate } from "@/utils/format-utils"
import type { PendingOrder, PendingOrdersState } from "@/hooks/use-base-template-pending-orders"

// Every http(s) link in the free-text customer image field (Drive links have no extension).
const customerImageUrls = (raw?: string) => (raw ? raw.match(/https?:\/\/[^\s,;]+/g) ?? [] : [])

// Same palette as the order review screen (OrderDetailsPanel).
function PendingOrderStatusBadge({ status }: { status: string }) {
  const s = (status || "").trim().toUpperCase()
  const style =
    s === "DESIGNED"
      ? { badge: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500", label: "Designed" }
      : s === "REPAIRED"
        ? { badge: "bg-green-50 text-green-700 border-green-200", dot: "bg-green-500", label: "Repaired" }
        : s === "SUPPORT CHECK"
          ? { badge: "bg-amber-50 text-amber-800 border-amber-300", dot: "bg-yellow-500", label: "Support Check" }
          : { badge: "bg-gray-100 text-gray-700 border-gray-200", dot: "bg-gray-400", label: s || "N/A" }
  return (
    <Badge className={`${style.badge} text-[10px] px-1.5 py-0`}>
      <div className={`w-2 h-2 ${style.dot} rounded-full mr-1`}></div>
      {style.label}
    </Badge>
  )
}

// Clamp to 3 lines without relying on a `line-clamp-3` class (not generated elsewhere).
const CLAMP_3: CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 3,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
}

interface PendingOrdersSectionProps {
  state: PendingOrdersState
  pendingCount: number
  getCachedImageUrl: (url: string | null | undefined) => string | null
  activeImageUrl?: string
  // Show a photo large in the modal's image viewer (Product tab).
  onShowImage: (url: string, label: string, source: "order" | "customer") => void
}

// "Đơn chờ duyệt (N)": the variant's waiting orders, newest first, so the reviewer can check
// them directly. Read-only — the review action is still per template.
export function PendingOrdersSection({
  state,
  pendingCount,
  getCachedImageUrl,
  activeImageUrl,
  onShowImage,
}: PendingOrdersSectionProps) {
  const [copied, setCopied] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  if (pendingCount <= 0) return null
  if (!state.loading && !state.error && state.orders.length === 0 && state.remaining === 0) return null

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000)
    } catch (error) {
      console.error("Failed to copy:", error)
    }
  }

  const toggleExpanded = (itemId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })

  const count = state.loading ? pendingCount : state.orders.length + state.remaining

  return (
    <div className="border-b border-gray-200">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-900">Đơn chờ duyệt ({count})</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={state.reload}
            disabled={state.loading}
            className="h-6 w-6 p-0 hover:bg-gray-100"
            title="Tải lại danh sách đơn chờ"
          >
            {state.loading ? (
              <Loader2 className="h-3 w-3 animate-spin text-gray-500" />
            ) : (
              <RefreshCw className="h-3 w-3 text-gray-500" />
            )}
          </Button>
        </div>

        {state.loading && state.orders.length === 0 ? (
          <div className="text-xs text-gray-500">Đang tải đơn chờ...</div>
        ) : state.error ? (
          <div className="text-xs text-red-600" title={state.error}>
            Không tải được đơn chờ.{" "}
            <button type="button" onClick={state.reload} className="underline hover:text-red-800">
              Thử lại
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {state.orders.map((o) => (
              <PendingOrderCard
                key={o.itemId}
                order={o}
                copied={copied}
                onCopy={copy}
                expanded={expanded.has(o.itemId)}
                onToggleExpanded={() => toggleExpanded(o.itemId)}
                getCachedImageUrl={getCachedImageUrl}
                activeImageUrl={activeImageUrl}
                onShowImage={onShowImage}
              />
            ))}
            {state.remaining > 0 && (
              <div className="text-xs text-gray-500 italic">Còn {state.remaining} đơn chưa tải.</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function PendingOrderCard({
  order,
  copied,
  onCopy,
  expanded,
  onToggleExpanded,
  getCachedImageUrl,
  activeImageUrl,
  onShowImage,
}: {
  order: PendingOrder
  copied: string | null
  onCopy: (key: string, text: string) => void
  expanded: boolean
  onToggleExpanded: () => void
  getCachedImageUrl: (url: string | null | undefined) => string | null
  activeImageUrl?: string
  onShowImage: PendingOrdersSectionProps["onShowImage"]
}) {
  const storeUrl = listingUrl(order)
  const product = order.productImage?.trim()
  const customer = customerImageUrls(order.customerImage)
  const personalization = order.personalization?.trim() ?? ""
  const longPersonalization = personalization.split("\n").length > 3 || personalization.length > 160
  const idKey = `id:${order.itemId}`
  const persKey = `p:${order.itemId}`

  const thumb = (url: string, label: string, source: "order" | "customer", badge: string | null) => (
    <button
      key={`${source}:${url}`}
      type="button"
      onClick={() => onShowImage(url, label, source)}
      className={`relative flex-shrink-0 w-14 h-14 rounded border-2 overflow-hidden bg-white ${
        activeImageUrl === url ? "border-blue-500" : "border-gray-200 hover:border-gray-400"
      }`}
      title={`${label} — bấm để xem lớn`}
    >
      <LazyImage
        src={getCachedImageUrl(url) || url}
        alt={label}
        className="w-full h-full"
        fit="cover"
        previewSize={200}
        fullSize={400}
      />
      {badge && (
        <span className="absolute top-0 left-0 bg-black/70 text-white text-[9px] leading-none px-1 py-0.5 rounded-br">
          {badge}
        </span>
      )}
    </button>
  )

  return (
    <div className="rounded-lg border border-gray-200 p-3 space-y-2">
      <div className="flex items-start gap-2">
        {(product || customer.length > 0) && (
          <div className="flex gap-1 flex-shrink-0">
            {product && thumb(product, `Ảnh sản phẩm ${order.itemId}`, "order", null)}
            {customer.map((url, i) =>
              thumb(url, `Ảnh khách ${order.itemId}${customer.length > 1 ? ` #${i + 1}` : ""}`, "customer", "khách")
            )}
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1 text-xs">
          <div className="flex items-center gap-1 min-w-0">
            <span className="font-mono font-medium text-gray-900 break-all">{order.itemId}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCopy(idKey, order.itemId)}
              className="h-5 w-5 p-0 hover:bg-gray-100 flex-shrink-0"
              title="Copy item ID"
            >
              {copied === idKey ? (
                <CheckCheck className="h-3 w-3 text-green-600" />
              ) : (
                <Copy className="h-3 w-3 text-gray-500" />
              )}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <PendingOrderStatusBadge status={order.status} />
            <span className="text-gray-500">{order.date ? formatDate(order.date) : "N/A"}</span>
          </div>
          <div>
            {order.store && storeUrl ? (
              <a
                href={storeUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={listingUrlTitle(order.channel)}
                className="font-medium text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
              >
                {order.store}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <span className="font-medium">{order.store || "N/A"}</span>
            )}
            {order.country && <span className="text-gray-500"> · {order.country}</span>}
          </div>
        </div>
      </div>

      {personalization && (
        <div className="bg-blue-50 rounded p-2 border border-blue-200">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-blue-900">Personalization</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCopy(persKey, personalization)}
              className="h-5 w-5 p-0 hover:bg-blue-100"
              title="Copy personalization text"
            >
              {copied === persKey ? (
                <CheckCheck className="h-3 w-3 text-green-600" />
              ) : (
                <Copy className="h-3 w-3 text-blue-700" />
              )}
            </Button>
          </div>
          <p
            className="text-xs text-blue-800 leading-relaxed whitespace-pre-wrap break-words"
            style={expanded ? undefined : CLAMP_3}
          >
            {personalization}
          </p>
          {longPersonalization && (
            <button
              type="button"
              onClick={onToggleExpanded}
              className="text-[11px] text-blue-600 hover:text-blue-800 hover:underline mt-1"
            >
              {expanded ? "Thu gọn" : "Xem thêm"}
            </button>
          )}
        </div>
      )}

      {order.orderNote?.trim() && (
        <div className="bg-purple-50 rounded p-2 border border-purple-200">
          <div className="text-[11px] font-semibold text-purple-900 mb-1">Ghi chú đơn</div>
          <p className="text-xs text-purple-800 leading-relaxed whitespace-pre-wrap break-words">
            {order.orderNote.trim()}
          </p>
        </div>
      )}
    </div>
  )
}
