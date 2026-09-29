"use client"

import { useEffect, useMemo, useState } from "react"
import { ImageViewer } from "@/components/review/image-viewer"
import { LazyImage } from "@/components/ui/lazy-image"
import { useDesignLinks } from "@/hooks/use-design-links"
import { useImageCache } from "@/hooks/use-image-cache"
import { cn } from "@/lib/utils"
import type { Order } from "@/types/order"
import type { ActiveTab } from "@/types/order-review"
import type { BaseTemplateProductType, BaseTemplateVariant } from "@/types/mera-base-template"
import { isTypingTarget } from "./utils"

interface TemplateViewerProps {
  pt: BaseTemplateProductType
  variant: BaseTemplateVariant
  // Shortcuts pause while a dialog is open.
  shortcutsEnabled: boolean
}

// Reuses the review screen's ImageViewer (tabs mode: zoom/pan/rotate/screenshot, Drive
// links through /api/drive-image, folder links expanded by useDesignLinks). The viewer
// is order-shaped, so the variant is adapted into a minimal Order:
//   Design  = base template design, Mockup = base template mockup,
//   Product = one of the real-order product photos (image_links), picked below.
// Remount per variant (key in the parent) so zoom/pan/tab state starts fresh.
export function TemplateViewer({ pt, variant, shortcutsEnabled }: TemplateViewerProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("design")
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

  const { getCachedImageUrl } = useImageCache()
  const designUrls = useDesignLinks(variant.base_template_design)
  const mockupUrls = useDesignLinks(variant.base_template_mockup)

  const productImages = useMemo(() => {
    const own = variant.image_links ?? []
    return own.length > 0 ? own : (pt.image_links ?? [])
  }, [variant.image_links, pt.image_links])

  const order: Order = useMemo(
    () => ({
      itemId: `${pt.slug}:${variant.variant_key}`,
      sheetId: "",
      status: variant.base_template_status,
      designLink: variant.base_template_design,
      mockup: variant.base_template_mockup,
      productImage: productImages[Math.min(productIndex, Math.max(productImages.length - 1, 0))],
      productType: pt.slug,
      designer: variant.designer,
    }),
    [pt.slug, variant, productImages, productIndex]
  )

  // Reset pan/zoom whenever the displayed image changes.
  useEffect(() => {
    setZoom(100)
    setPanX(0)
    setPanY(0)
  }, [activeTab, designIndex, mockupIndex, productIndex])

  useEffect(() => {
    if (!shortcutsEnabled) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return
      switch (e.key) {
        case "d":
        case "D":
          e.preventDefault()
          setActiveTab("design")
          break
        case "m":
        case "M":
          e.preventDefault()
          setActiveTab("mockup")
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
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [shortcutsEnabled])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ImageViewer sizes its image for the full-screen review modal (80vh / 90vw inline);
          here it sits in the middle column, so cap it to the column instead of cropping. */}
      <div className="flex-1 min-h-0 [&_img]:!max-h-[calc(100vh_-_20rem)] [&_img]:!max-w-[max(240px,calc(100vw_-_62rem))]">
        <ImageViewer
          order={order}
          viewMode="tabs"
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
          designUrls={designUrls}
          designIndex={designIndex}
          setDesignIndex={setDesignIndex}
          mockupUrls={mockupUrls}
          mockupIndex={mockupIndex}
          setMockupIndex={setMockupIndex}
        />
      </div>

      {productImages.length > 0 && (
        <div className="flex-shrink-0 pt-2">
          <div className="text-[11px] text-gray-500 mb-1">
            Ảnh sản phẩm thật từ đơn ({productImages.length}) — bấm để xem ở tab Product
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {productImages.map((url, i) => (
              <button
                key={`${url}-${i}`}
                type="button"
                onClick={() => {
                  setProductIndex(i)
                  setActiveTab("product")
                }}
                className={cn(
                  "flex-shrink-0 w-14 h-14 rounded border-2 overflow-hidden bg-white",
                  activeTab === "product" && i === productIndex ? "border-blue-500" : "border-gray-200"
                )}
                title={url}
              >
                <LazyImage src={url} alt={`Product ${i + 1}`} className="w-full h-full" fit="cover" previewSize={400} fullSize={400} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
