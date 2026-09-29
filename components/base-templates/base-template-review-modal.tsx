"use client"

import type React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Maximize,
  RefreshCw,
  Wrench,
  X,
} from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { LazyImage } from "@/components/ui/lazy-image"
import { ImageViewer } from "@/components/review/image-viewer"
import { KeyboardShortcuts } from "@/components/review/keyboard-shortcuts"
import { DEFAULT_WIDTHS } from "@/constants/review-modal"
import { useApi } from "@/hooks/use-api"
import { useDesignLinks } from "@/hooks/use-design-links"
import { useImageCache } from "@/hooks/use-image-cache"
import { refreshImages } from "@/hooks/use-image-refresh"
import { toast } from "@/hooks/use-toast"
import { useBaseTemplateSampleOrder, sampleItemKeyOf } from "@/hooks/use-base-template-sample-order"
import { copyVisibleImageToClipboard } from "@/utils/screenshot"
import type { Order } from "@/types/order"
import type { ActiveTab, ProductTypeNoteResponse, ViewMode } from "@/types/order-review"
import { BaseTemplateDetailsPanel, BaseTemplateStatusBadge } from "./base-template-details-panel"
import {
  type QueueEntry,
  CATCH_ALL_LABEL,
  conditionLines,
  conditionSummary,
  countriesLabel,
  hasNewValues,
  isTypingTarget,
  statusOf,
} from "./utils"

type GallerySource = "variant" | "pending" | "pt"

interface GalleryImage {
  url: string
  source: GallerySource
  label: string
}

const SOURCE_BADGE: Record<GallerySource, string | null> = { variant: null, pending: "chờ", pt: "PT" }

// Own key: resizing here must not move the order review modal's columns.
const COLUMN_WIDTHS_KEY = "base-template-modal-column-widths"
// Shared with the order review modal on purpose: one "how I like to look at images" setting.
const VIEW_MODE_KEY = "orderReviewViewMode"

interface BaseTemplateReviewModalProps {
  isOpen: boolean
  onClose: () => void
  entry: QueueEntry
  // Opened from a thumbnail on the list: show this image in the Product tab first.
  focusImageUrl?: string | null
  currentIndex: number
  totalCount: number
  onNext: () => void
  onPrevious: () => void
  // "Chờ designer sửa" tab: look only, no actions.
  readOnly: boolean
  busy: "confirm" | "repair" | null
  canConfirm: boolean
  canAct: boolean
  // null = switch state unknown (settings failed to load)
  autoStatusOff: boolean | null
  onConfirm: () => void
  onRequestNeedRepair: () => void
  // True while the NEED REPAIR note dialog is open — every shortcut pauses.
  shortcutsPaused: boolean
}

// Full-screen review of one base template variant, laid out like OrderReviewModal
// (header · resizable left controls · ImageViewer · details panel) so checkers use the
// same muscle memory: 1 confirm, 2 need repair, Space / Shift+Space, M/D/P, R, F, S, Esc.
export function BaseTemplateReviewModal({
  isOpen,
  onClose,
  entry,
  focusImageUrl,
  currentIndex,
  totalCount,
  onNext,
  onPrevious,
  readOnly,
  busy,
  canConfirm,
  canAct,
  autoStatusOff,
  onConfirm,
  onRequestNeedRepair,
  shortcutsPaused,
}: BaseTemplateReviewModalProps) {
  const { pt, variant } = entry
  const status = statusOf(variant)

  const [viewMode, setViewMode] = useState<ViewMode>("float")
  const [activeTab, setActiveTab] = useState<ActiveTab>("mockup")
  const [zoom, setZoom] = useState(100)
  const [rotation, setRotation] = useState(0)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [dragStartPan, setDragStartPan] = useState({ x: 0, y: 0 })
  const [screenshotTaken, setScreenshotTaken] = useState(false)
  const [designIndex, setDesignIndex] = useState(0)
  const [mockupIndex, setMockupIndex] = useState(0)
  const [productIndex, setProductIndex] = useState(0)
  const [copiedSlug, setCopiedSlug] = useState(false)
  const [showApproved, setShowApproved] = useState(false)
  const [columnWidths, setColumnWidths] = useState(DEFAULT_WIDTHS)
  const [isResizing, setIsResizing] = useState<"left" | "right" | null>(null)
  const [startX, setStartX] = useState(0)
  const [startWidths, setStartWidths] = useState(DEFAULT_WIDTHS)
  const imageContainerRef = useRef<HTMLDivElement>(null)

  const { getCachedImageUrl } = useImageCache()
  const designUrls = useDesignLinks(variant.base_template_design)
  const mockupUrls = useDesignLinks(variant.base_template_mockup)

  const sample = useBaseTemplateSampleOrder(isOpen ? entry.key : null, pt.project_id, sampleItemKeyOf(variant))

  const {
    data: productTypeNoteData,
    loading: productTypeNoteLoading,
    error: productTypeNoteError,
    refetch: refetchProductTypeNote,
  } = useApi<ProductTypeNoteResponse>(pt.slug ? `/product-type-notes/${encodeURIComponent(pt.slug)}` : "", {
    enabled: isOpen && !!pt.slug,
  })

  // Everything the Product tab can show, in this order: photos of orders this variant's rule
  // selects -> photo of each waiting value's sample order -> the product type's own photos.
  // Deduped by URL; every field is optional (older Mera -> fewer or no images).
  const gallery = useMemo(() => {
    const seen = new Set<string>()
    const out: GalleryImage[] = []
    const add = (raw: string | undefined, source: GallerySource, label: string) => {
      const url = raw?.trim()
      if (!url || seen.has(url)) return
      seen.add(url)
      out.push({ url, source, label })
    }
    for (const u of variant.image_links ?? []) add(u, "variant", "Đơn khớp variant")
    for (const pv of variant.pending_values ?? []) {
      add(pv.image_link, "pending", `Giá trị chờ: ${pv.label || pv.signature || "(không có trường phân biệt)"}`)
    }
    for (const u of pt.image_links ?? []) add(u, "pt", "Ảnh product type")
    return out
  }, [variant.image_links, variant.pending_values, pt.image_links])

  const safeProductIndex = gallery.length > 0 ? Math.min(productIndex, gallery.length - 1) : 0
  const currentProductUrl = gallery[safeProductIndex]?.url
  const ptImages = useMemo(() => gallery.filter((g) => g.source === "pt").map((g) => g.url), [gallery])

  // Show one gallery image large in the viewer (Product tab).
  const showImage = (url: string | undefined) => {
    const idx = url ? gallery.findIndex((g) => g.url === url.trim()) : -1
    if (idx < 0) return
    setProductIndex(idx)
    setActiveTab("product")
  }
  const showImageRef = useRef(showImage)
  showImageRef.current = showImage

  // ImageViewer is order-shaped: Design / Mockup = the base template, Product = a real photo.
  const order: Order = useMemo(
    () => ({
      itemId: `${pt.slug}:${variant.variant_key}`,
      sheetId: "",
      status: variant.base_template_status,
      designLink: variant.base_template_design,
      mockup: variant.base_template_mockup,
      productImage: currentProductUrl,
      productType: pt.slug,
      designer: variant.designer,
    }),
    [pt.slug, variant, currentProductUrl]
  )

  // Fresh viewer state for every variant, like the order modal does per order.
  useEffect(() => {
    setZoom(100)
    setActiveTab("mockup")
    setDesignIndex(0)
    setMockupIndex(0)
    setProductIndex(0)
    setPanX(0)
    setPanY(0)
    setRotation(0)
    setShowApproved(false)
  }, [entry.key])

  // Declared after the reset above, so on open (same commit) it runs last and wins.
  useEffect(() => {
    if (focusImageUrl) showImageRef.current(focusImageUrl)
  }, [entry.key, focusImageUrl])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLUMN_WIDTHS_KEY)
      if (saved) setColumnWidths(JSON.parse(saved))
    } catch (e) {
      console.error("Failed to parse saved column widths:", e)
    }
    try {
      const savedViewMode = localStorage.getItem(VIEW_MODE_KEY) as ViewMode | null
      if (savedViewMode === "tabs" || savedViewMode === "stack" || savedViewMode === "float") setViewMode(savedViewMode)
    } catch {
      // storage unavailable — keep the default
    }
  }, [])

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode)
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode)
    } catch {
      // ignore
    }
  }

  const saveColumnWidths = (widths: typeof columnWidths) => {
    try {
      localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(widths))
    } catch {
      // ignore
    }
    setColumnWidths(widths)
  }

  const handleMouseDown = (e: React.MouseEvent, side: "left" | "right") => {
    e.preventDefault()
    setIsResizing(side)
    setStartX(e.clientX)
    setStartWidths(columnWidths)
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const deltaPercent = ((e.clientX - startX) / window.innerWidth) * 100
      if (isResizing === "left") {
        saveColumnWidths({ ...columnWidths, left: Math.max(15, Math.min(35, startWidths.left + deltaPercent)) })
      } else {
        saveColumnWidths({ ...columnWidths, right: Math.max(20, Math.min(40, startWidths.right - deltaPercent)) })
      }
    }
    const handleMouseUp = () => setIsResizing(null)

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResizing, startX, startWidths, columnWidths])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => undefined)
    } else {
      document.exitFullscreen().catch(() => undefined)
    }
  }

  const handleScreenshot = () => {
    if (!imageContainerRef.current) return
    copyVisibleImageToClipboard(imageContainerRef.current, () => {
      setScreenshotTaken(true)
      setTimeout(() => setScreenshotTaken(false), 1000)
    })
  }

  const handleCopySlug = async () => {
    try {
      await navigator.clipboard.writeText(pt.slug)
      setCopiedSlug(true)
      setTimeout(() => setCopiedSlug(false), 2000)
    } catch (error) {
      console.error("Failed to copy product type slug:", error)
    }
  }

  const handleConfirmKey = () => {
    if (canConfirm) onConfirm()
    else if (!readOnly && status === "NEED REPAIR") {
      toast({ title: "Template đang NEED REPAIR — không duyệt được", variant: "destructive" })
    }
  }

  // Latest handlers for the single document listener below.
  const keyActionsRef = useRef({
    confirm: handleConfirmKey,
    needRepair: () => {},
    next: onNext,
    prev: onPrevious,
    screenshot: handleScreenshot,
    fullscreen: toggleFullscreen,
  })
  keyActionsRef.current = {
    confirm: handleConfirmKey,
    needRepair: () => {
      if (canAct) onRequestNeedRepair()
    },
    next: onNext,
    prev: onPrevious,
    screenshot: handleScreenshot,
    fullscreen: toggleFullscreen,
  }

  // Deliberately NOT gated on NODE_ENV. Esc is handled by the Radix Dialog (closes the
  // topmost dialog only, so it closes the note dialog first when that is open).
  useEffect(() => {
    if (!isOpen || shortcutsPaused) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return
      const k = keyActionsRef.current
      switch (e.key) {
        case "1":
          e.preventDefault()
          k.confirm()
          break
        case "2":
          e.preventDefault()
          k.needRepair()
          break
        case " ":
          e.preventDefault()
          if (busy) return
          if (e.shiftKey) k.prev()
          else k.next()
          break
        case "m":
        case "M":
          e.preventDefault()
          setActiveTab("mockup")
          break
        case "d":
        case "D":
          e.preventDefault()
          setActiveTab("design")
          break
        case "p":
        case "P":
          e.preventDefault()
          setActiveTab("product")
          break
        case "r":
        case "R":
          e.preventDefault()
          setRotation((prev) => (prev + 90) % 360)
          break
        case "f":
        case "F":
          e.preventDefault()
          k.fullscreen()
          break
        case "s":
        case "S":
          e.preventDefault()
          k.screenshot()
          break
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [isOpen, shortcutsPaused, busy])

  const pendingValues = variant.pending_values ?? []
  const approved = variant.approved_signatures ?? []
  const lines = conditionLines(variant)
  const title = pt.display_name || pt.slug
  const summary = conditionSummary(variant)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-none max-h-none w-screen h-screen overflow-hidden p-0 m-0">
        <DialogTitle className="sr-only">
          Base Template Review - {title} · {summary}
        </DialogTitle>

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 truncate max-w-[55vw]" title={`${title} · ${summary}`}>
                {title}
                <span className="font-normal text-gray-500"> · {summary}</span>
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopySlug}
                className="h-6 w-6 p-0 hover:bg-gray-100 flex-shrink-0"
                title={`Copy slug: ${pt.slug}`}
              >
                {copiedSlug ? <CheckCheck className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3 text-gray-500" />}
              </Button>
            </div>
            <div className="flex-shrink-0">
              <BaseTemplateStatusBadge status={status} />
            </div>
            <span className="text-sm text-gray-500 flex-shrink-0">
              {currentIndex + 1}/{totalCount}
            </span>
            {pt.project_name && (
              <span className="text-xs text-gray-400 truncate hidden xl:inline">{pt.project_name}</span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Button variant="outline" size="sm" onClick={refreshImages} title="Tải lại ảnh (design / mockup / product)">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={toggleFullscreen} title="Toggle Fullscreen (F)">
              <Maximize className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onPrevious}
              disabled={currentIndex <= 0 || !!busy}
              title="Previous (Shift+Space)"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onNext}
              disabled={currentIndex >= totalCount - 1 || !!busy}
              title="Next (Space)"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose} title="Close (Esc)">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex h-[calc(100vh-60px)] overflow-hidden">
          {/* Left Panel - Controls */}
          <div
            className="border-r border-gray-200 bg-gray-50 overflow-y-auto relative"
            style={{ width: `${columnWidths.left}%` }}
          >
            <div
              className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500 hover:w-1.5 transition-all z-10"
              onMouseDown={(e) => handleMouseDown(e, "left")}
              title="Drag to resize"
            />

            <div className="p-4 space-y-4">
              {/* View Mode Toggle */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">View:</span>
                <div className="flex gap-1">
                  {(["tabs", "stack", "float"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => handleViewModeChange(mode)}
                      className={`px-2 py-1 rounded text-xs transition-colors ${
                        viewMode === mode ? "bg-blue-100 text-blue-700" : "bg-white text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {mode === "tabs" ? "Tabs" : mode === "stack" ? "Stack" : "Float"}
                    </button>
                  ))}
                </div>
              </div>

              {readOnly ? (
                <div className="rounded-lg p-3 border border-gray-200 bg-white text-xs text-gray-600">
                  Chỉ xem — template đang chờ designer sửa. Khi designer bấm “Đã sửa xong”, nó quay lại hàng đợi
                  (REPAIRED).
                </div>
              ) : (
                <>
                  {/* Confirm Button */}
                  <div className="flex gap-2">
                    <Button
                      onClick={onConfirm}
                      disabled={!canConfirm}
                      title={status === "NEED REPAIR" ? "Template đang NEED REPAIR" : "Phím 1"}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm py-2 shadow-sm transition-all duration-200 hover:shadow-md"
                    >
                      {busy === "confirm" ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4 mr-2" />
                      )}
                      CONFIRM (1)
                    </Button>
                  </div>
                  {autoStatusOff === true && (
                    <div className="flex items-start gap-1.5 text-[11px] text-amber-800">
                      <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <span>Công tắc TẮT — duyệt chỉ đổi trạng thái template, đơn giữ DESIGNED.</span>
                    </div>
                  )}
                  {autoStatusOff === false && (
                    <div className="text-[11px] text-green-800">
                      Công tắc BẬT — các đơn chờ mang giá trị đang hiện sẽ sang CONFIRMED.
                    </div>
                  )}
                </>
              )}

              {/* 1. Pending values */}
              <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-purple-900">
                    1. Giá trị đang chờ ({pendingValues.length})
                  </h3>
                  <span className="text-[11px] text-purple-700">{variant.pending_count ?? 0} đơn</span>
                </div>
                {pendingValues.length === 0 ? (
                  <p className="text-xs text-purple-800 italic">Không có đơn chờ — duyệt chỉ đổi trạng thái template.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {pendingValues.map((pv) => (
                      <li key={pv.signature} className="flex items-start justify-between gap-2 text-xs">
                        <span className="flex items-start gap-2 min-w-0">
                          {pv.image_link && (
                            <button
                              type="button"
                              onClick={() => showImage(pv.image_link)}
                              className={`flex-shrink-0 w-10 h-10 rounded border-2 overflow-hidden bg-white ${
                                activeTab === "product" && currentProductUrl === pv.image_link.trim()
                                  ? "border-blue-500"
                                  : "border-purple-200 hover:border-purple-400"
                              }`}
                              title={`Ảnh đơn mẫu ${pv.sample_item_key} — bấm để xem lớn`}
                            >
                              <LazyImage
                                src={pv.image_link}
                                alt={`Đơn mẫu ${pv.sample_item_key}`}
                                className="w-full h-full"
                                fit="cover"
                                previewSize={200}
                                fullSize={200}
                              />
                            </button>
                          )}
                          <span className="text-purple-950 break-words min-w-0" title={pv.signature || "(chữ ký rỗng)"}>
                            {pv.label || pv.signature || "(không có trường phân biệt)"}
                            <span className="text-purple-600"> · {pv.count} đơn</span>
                          </span>
                        </span>
                        {pv.approved ? (
                          <Badge variant="outline" className="flex-shrink-0 text-[10px] px-1.5 py-0 bg-white text-gray-600 border-gray-300">
                            đã duyệt – đơn tồn
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="flex-shrink-0 text-[10px] px-1.5 py-0 bg-amber-50 text-amber-800 border-amber-300">
                            giá trị mới
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* 2. Match conditions */}
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                <h3 className="text-xs font-semibold text-blue-900 mb-1">2. Điều kiện khớp</h3>
                {lines.length === 0 ? (
                  <p className="text-xs text-blue-800 italic">{CATCH_ALL_LABEL}</p>
                ) : (
                  <ul className="space-y-0.5">
                    {lines.map((l, i) => (
                      <li key={i} className="text-xs text-blue-800 leading-relaxed break-words">
                        {i > 0 && <span className="text-[10px] font-semibold text-blue-400 mr-1">HOẶC</span>}
                        {l}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-blue-700 mt-1.5">
                  <span className="font-medium">Countries:</span> {countriesLabel(variant)}
                </p>
              </div>

              {/* 3. Approved values */}
              <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-green-900">3. Giá trị đã duyệt ({approved.length})</h3>
                  {approved.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowApproved((s) => !s)}
                      className="h-5 w-5 p-0 hover:bg-green-100"
                      title={showApproved ? "Hide" : "Show"}
                    >
                      {showApproved ? <EyeOff className="h-3 w-3 text-green-700" /> : <Eye className="h-3 w-3 text-green-700" />}
                    </Button>
                  )}
                </div>
                {showApproved && (
                  <ul className="mt-2 space-y-0.5 max-h-48 overflow-y-auto">
                    {approved.map((s) => (
                      <li key={s} className="text-[11px] font-mono text-green-900 break-all">
                        {s || "(chữ ký rỗng)"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Need Repair Button */}
              {!readOnly && (
                <div className="flex gap-2">
                  <Button
                    onClick={onRequestNeedRepair}
                    disabled={!canAct}
                    title="Phím 2"
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm py-2 shadow-sm transition-all duration-200 hover:shadow-md"
                  >
                    {busy === "repair" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Wrench className="h-4 w-4 mr-2" />
                    )}
                    NEED REPAIR (2)
                  </Button>
                </div>
              )}

              {hasNewValues(variant) && !readOnly && (
                <p className="text-[11px] text-amber-800">
                  Có giá trị mới — CONFIRM sẽ ghi nhận đúng các giá trị đang hiện ở mục 1.
                </p>
              )}

              <KeyboardShortcuts
                primaryActions={[
                  { label: "Confirm", keyLabel: "1" },
                  { label: "Need Repair", keyLabel: "2" },
                ]}
                itemNoun="Template"
                showCopyItemId={false}
                showCustomerTab={false}
                showOtherActions={false}
              />
            </div>
          </div>

          {/* Center Panel - Image Viewer */}
          <div
            className="flex flex-col overflow-hidden relative"
            style={{ width: `${100 - columnWidths.left - columnWidths.right}%` }}
          >
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 h-full" ref={imageContainerRef}>
                <ImageViewer
                  order={order}
                  viewMode={viewMode}
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  zoom={zoom}
                  setZoom={setZoom}
                  rotation={rotation}
                  setRotation={setRotation}
                  panX={panX}
                  setPanX={setPanX}
                  panY={panY}
                  setPanY={setPanY}
                  isDragging={isDragging}
                  setIsDragging={setIsDragging}
                  dragStart={dragStart}
                  setDragStart={setDragStart}
                  dragStartPan={dragStartPan}
                  setDragStartPan={setDragStartPan}
                  screenshotTaken={screenshotTaken}
                  setScreenshotTaken={setScreenshotTaken}
                  getCachedImageUrl={getCachedImageUrl}
                  onScreenshot={handleScreenshot}
                  designUrls={designUrls}
                  designIndex={designIndex}
                  setDesignIndex={setDesignIndex}
                  mockupUrls={mockupUrls}
                  mockupIndex={mockupIndex}
                  setMockupIndex={setMockupIndex}
                />
              </div>
            </div>

            {gallery.length > 1 && (
              <div className="flex-shrink-0 border-t border-gray-200 bg-white px-4 py-2">
                <div className="text-[11px] text-gray-500 mb-1">
                  Ảnh sản phẩm ({gallery.length})
                  {activeTab === "product" && gallery[safeProductIndex] && (
                    <span className="text-gray-700"> · đang xem: {gallery[safeProductIndex].label}</span>
                  )}{" "}
                  — bấm để xem ở tab Product
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {gallery.map((img, i) => (
                    <button
                      key={img.url}
                      type="button"
                      onClick={() => {
                        setProductIndex(i)
                        setActiveTab("product")
                      }}
                      className={`relative flex-shrink-0 w-14 h-14 rounded border-2 overflow-hidden bg-white ${
                        activeTab === "product" && i === safeProductIndex ? "border-blue-500" : "border-gray-200"
                      }`}
                      title={img.label}
                    >
                      <LazyImage src={img.url} alt={img.label} className="w-full h-full" fit="cover" previewSize={400} fullSize={400} />
                      {SOURCE_BADGE[img.source] && (
                        <span className="absolute top-0 left-0 bg-black/70 text-white text-[9px] leading-none px-1 py-0.5 rounded-br">
                          {SOURCE_BADGE[img.source]}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - Template Details */}
          <div
            className="border-l border-gray-200 bg-white overflow-y-auto relative"
            style={{ width: `${columnWidths.right}%` }}
          >
            <div
              className="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-blue-500 hover:w-1.5 transition-all z-10"
              onMouseDown={(e) => handleMouseDown(e, "right")}
              title="Drag to resize"
            />

            <BaseTemplateDetailsPanel
              pt={pt}
              variant={variant}
              sample={sample}
              productTypeNoteData={productTypeNoteData}
              productTypeNoteLoading={productTypeNoteLoading}
              productTypeNoteError={productTypeNoteError}
              refetchProductTypeNote={refetchProductTypeNote}
              getCachedImageUrl={getCachedImageUrl}
              productTypeImages={ptImages}
              activeImageUrl={activeTab === "product" ? currentProductUrl : undefined}
              onShowImage={showImage}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
