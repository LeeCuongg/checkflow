"use client"

import type React from "react"
import { forwardRef, useState } from "react"
import { CheckCheck, Copy, Globe, Layers, Package, User } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { LazyImage } from "@/components/ui/lazy-image"
import { cn } from "@/lib/utils"
import { BaseTemplateStatusBadge } from "./base-template-details-panel"
import { ImagePopup } from "./image-popup"
import { PreviewStrip } from "./preview-strip"
import { type QueueEntry, conditionSummary, countriesLabel, hasNewValues, statusOf } from "./utils"

interface BaseTemplateListItemProps {
  entry: QueueEntry
  selected: boolean
  showProject: boolean
  // Opens the review modal (click / Enter on the row). Thumbnails open an image popup instead.
  onOpen: (imageUrl?: string) => void
}

// Small clickable photo (Drive links go through the /api/drive-image proxy inside LazyImage).
function Thumb({
  url,
  label,
  className,
  onOpen,
}: {
  url: string
  label: string
  className?: string
  onOpen: (imageUrl: string) => void
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onOpen(url)
      }}
      className={cn(
        "flex-shrink-0 rounded border border-gray-200 overflow-hidden bg-white hover:border-blue-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        className
      )}
      title={`${label} — bấm để xem lớn`}
    >
      <LazyImage
        src={url}
        alt={label}
        className="w-full h-full"
        fit="cover"
        previewSize={200}
        fullSize={200}
        fallbackSrc="/placeholder.svg?height=40&width=40&text=%3F"
      />
    </button>
  )
}

// One reviewable variant, styled like OrderListItem on /review. Click / Enter opens the
// review modal on it.
export const BaseTemplateListItem = forwardRef<HTMLDivElement, BaseTemplateListItemProps>(function BaseTemplateListItem(
  { entry, selected, showProject, onOpen },
  ref
) {
  const { pt, variant } = entry
  const [copiedSlug, setCopiedSlug] = useState(false)
  const [popup, setPopup] = useState<{ url: string; label: string; linkUrl?: string } | null>(null)
  const showImage = (label: string) => (url: string) => setPopup({ url, label })
  const status = statusOf(variant)
  const pendingValues = variant.pending_values ?? []
  // Product type photo sits next to the name; the right column shows photos of orders that
  // match this variant.
  const ptImage = (pt.image_links ?? []).find(Boolean)
  const productImage = (variant.image_links ?? []).find(Boolean)
  const matchedImages = (variant.image_links ?? []).filter(Boolean).slice(0, 4)

  const stop = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleCopySlug = async (e: React.MouseEvent) => {
    stop(e)
    try {
      await navigator.clipboard.writeText(pt.slug)
      setCopiedSlug(true)
      setTimeout(() => setCopiedSlug(false), 2000)
    } catch (error) {
      console.error("Failed to copy slug:", error)
    }
  }

  return (
    <>
      <Card
        ref={ref}
        role="button"
        tabIndex={0}
        onClick={() => onOpen()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.target === e.currentTarget) {
            e.preventDefault()
            onOpen()
          }
        }}
        className={cn(
          "group cursor-pointer hover:shadow-lg transition-all duration-200 border-gray-200 hover:border-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
          selected && "border-blue-400 ring-1 ring-blue-300"
        )}
      >
        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-3 gap-3">
            <div className="flex items-center gap-3 flex-wrap min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                {ptImage && <Thumb url={ptImage} label="Ảnh product type" className="w-9 h-9" onOpen={showImage(`Ảnh product type · ${pt.slug}`)} />}
                <h3 className="font-semibold text-gray-900 text-lg truncate">{pt.display_name || pt.slug}</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopySlug}
                  className="h-6 w-6 p-0 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"
                  title={`Copy slug: ${pt.slug}`}
                >
                  {copiedSlug ? <CheckCheck className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3 text-gray-500" />}
                </Button>
              </div>
              <BaseTemplateStatusBadge status={status} />
              {variant.designer && (
                <Badge variant="outline" className="text-xs bg-gray-50 text-gray-600 border-gray-200">
                  <User className="w-3 h-3 mr-1" />
                  {variant.designer}
                </Badge>
              )}
              {variant.pending_count > 0 && (
                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                  {variant.pending_count} đơn chờ
                </Badge>
              )}
              {hasNewValues(variant) && (
                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-800 border-amber-300">
                  có giá trị mới
                </Badge>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left: variant details */}
            <div className="lg:col-span-2 space-y-3">
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-100 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="text-sm font-semibold text-blue-900">Điều kiện khớp</span>
                  </div>
                  <p className="text-sm text-blue-800 leading-relaxed line-clamp-2" title={conditionSummary(variant)}>
                    {conditionSummary(variant)}
                  </p>
                </div>
                {/* Photos of real orders that match these conditions — what this variant looks like. */}
                {matchedImages.length > 0 && (
                  <div className="flex gap-1.5 flex-shrink-0">
                    {matchedImages.map((url, i) => (
                      <Thumb
                        key={url}
                        url={url}
                        label={`Ảnh đơn khớp điều kiện ${i + 1}`}
                        className="w-14 h-14"
                        onOpen={showImage(`Ảnh đơn khớp điều kiện · ${conditionSummary(variant)}`)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {pendingValues.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                    <span className="text-sm font-semibold text-gray-700">Giá trị đang chờ</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {pendingValues.slice(0, 8).map((pv) => (
                      <span
                        key={pv.signature}
                        className={cn(
                          "text-xs rounded border inline-flex items-center gap-1.5",
                          pv.image_link ? "pl-0.5 pr-1.5 py-0.5" : "px-1.5 py-0.5",
                          pv.approved ? "bg-white text-gray-600 border-gray-200" : "bg-amber-50 text-amber-800 border-amber-200"
                        )}
                        title={pv.approved ? "đã duyệt – đơn tồn" : "giá trị mới"}
                      >
                        {pv.image_link && (
                          <Thumb
                            url={pv.image_link}
                            label={`Ảnh đơn mẫu ${pv.sample_item_key}`}
                            className="w-7 h-7"
                            onOpen={showImage(`${pv.label || pv.signature || "Giá trị"} · đơn ${pv.sample_item_key}`)}
                          />
                        )}
                        <span>
                          {pv.label || pv.signature || "(không có trường phân biệt)"} · {pv.count}
                        </span>
                      </span>
                    ))}
                    {pendingValues.length > 8 && (
                      <span className="text-xs text-gray-500">+{pendingValues.length - 8} giá trị</span>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="flex items-start gap-2 min-w-0" style={{ gridColumn: "1 / -1" }}>
                  <Package className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  <span className="font-medium text-gray-700 whitespace-nowrap">Product type:</span>
                  <span className="text-gray-600 break-all">{pt.slug}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-gray-700">Countries:</span>
                  <span className="text-gray-600">{countriesLabel(variant)}</span>
                </div>
                {showProject && pt.project_name && (
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-gray-700">Project:</span>
                    <span className="text-gray-600">{pt.project_name}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right: images */}
            <div className="space-y-3">
              <PreviewStrip
                productImage={productImage}
                designLink={variant.base_template_design}
                mockupLink={variant.base_template_mockup}
                onOpen={(url, label, linkUrl) => setPopup({ url, label: `${label} · ${pt.display_name || pt.slug}`, linkUrl })}
              />
            </div>
          </div>
        </div>
      </Card>
      {/* Outside the Card: portal events still bubble through the React tree, and a click in
          the popup must not reach the Card's onClick (which opens the review). */}
      <ImagePopup url={popup?.url ?? null} label={popup?.label} linkUrl={popup?.linkUrl} onClose={() => setPopup(null)} />
    </>
  )
})
