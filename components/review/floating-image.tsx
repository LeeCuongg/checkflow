"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { LazyImage } from "@/components/ui/lazy-image"
import { ExternalLink, ZoomIn, ZoomOut, Maximize2, Grid3x3, Layers, ChevronLeft, ChevronRight } from "lucide-react"
import type { Order } from "@/types/order"
import type { ActiveTab } from "@/types/order-review"
import { getImageUrl } from "@/utils/image-utils"

interface FloatingImageProps {
  order: Order
  activeTab: ActiveTab
  getCachedImageUrl: (url: string | null | undefined) => string | null
  designUrls?: string[]
  designIndex?: number
  setDesignIndex?: (index: number) => void
  mockupUrls?: string[]
  mockupIndex?: number
}

const FLOAT_SETTINGS_KEY = "orderReviewFloatSettings"
const FLOAT_MODE_KEY = "orderReviewFloatSettingsMode"

type BackgroundMode = "transparent" | "pattern" | "chroma" | "black"

interface FloatSettings {
  x: number
  y: number
  width: number
  height: number
  backgroundMode: BackgroundMode
  zoom: number
}

interface FloatSettingsByProductType {
  [productType: string]: FloatSettings
}

const DEFAULT_SETTINGS: FloatSettings = {
  x: 100,
  y: 100,
  width: 600,
  height: 400,
  backgroundMode: "transparent",
  zoom: 1,
}

export function FloatingImage({
  order,
  activeTab,
  getCachedImageUrl,
  designUrls = [],
  designIndex = 0,
  setDesignIndex,
  mockupUrls = [],
  mockupIndex = 0,
}: FloatingImageProps) {
  const safeDesignIndex = designUrls.length > 0 ? Math.min(designIndex, designUrls.length - 1) : 0
  const currentDesignUrl = designUrls[safeDesignIndex] ?? order.designLink ?? null
  const safeMockupIndex = mockupUrls.length > 0 ? Math.min(mockupIndex, mockupUrls.length - 1) : 0
  const currentMockupUrl = mockupUrls[safeMockupIndex] ?? order.mockup ?? null
  const [perProductTypeMode, setPerProductTypeMode] = useState(() => {
    try {
      const saved = localStorage.getItem(FLOAT_MODE_KEY)
      return saved === "true"
    } catch {
      return false
    }
  })

  const getSettingsForProductType = (productType?: string): FloatSettings => {
    try {
      const saved = localStorage.getItem(FLOAT_SETTINGS_KEY)
      if (saved) {
        const allSettings: FloatSettingsByProductType = JSON.parse(saved)
        const key = perProductTypeMode && productType ? productType : "default"
        const settings = allSettings[key] || DEFAULT_SETTINGS
        if ("showCheckerboard" in settings) {
          return {
            ...settings,
            backgroundMode: (settings as any).showCheckerboard ? "pattern" : "transparent",
          }
        }
        return settings
      }
    } catch (e) {
      console.error("Failed to load saved float settings:", e)
    }
    return DEFAULT_SETTINGS
  }

  const saveSettingsForProductType = (productType: string | undefined, settings: FloatSettings) => {
    try {
      const saved = localStorage.getItem(FLOAT_SETTINGS_KEY)
      const allSettings: FloatSettingsByProductType = saved ? JSON.parse(saved) : {}
      const key = perProductTypeMode && productType ? productType : "default"
      allSettings[key] = settings
      localStorage.setItem(FLOAT_SETTINGS_KEY, JSON.stringify(allSettings))
    } catch (e) {
      console.error("Failed to save float settings:", e)
    }
  }

  const currentSettings = getSettingsForProductType(order.productType)

  const [position, setPosition] = useState({ x: currentSettings.x, y: currentSettings.y })
  const [size, setSize] = useState({ width: currentSettings.width, height: currentSettings.height })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 })

  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>(currentSettings.backgroundMode)

  const [zoom, setZoom] = useState(currentSettings.zoom)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })

  const floatingRef = useRef<HTMLDivElement>(null)
  const imageContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const settings = getSettingsForProductType(order.productType)
    setPosition({ x: settings.x, y: settings.y })
    setSize({ width: settings.width, height: settings.height })
    setBackgroundMode(settings.backgroundMode)
    setZoom(settings.zoom)
    setPan({ x: 0, y: 0 })
  }, [order.productType, perProductTypeMode])

  useEffect(() => {
    const settings: FloatSettings = {
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height,
      backgroundMode,
      zoom,
    }
    saveSettingsForProductType(order.productType, settings)
  }, [position, size, backgroundMode, zoom, order.productType, perProductTypeMode])

  useEffect(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [activeTab, order.itemId, safeDesignIndex, safeMockupIndex])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        })
      }
      if (isResizing) {
        const deltaX = e.clientX - resizeStart.x
        const deltaY = e.clientY - resizeStart.y

        setSize({
          width: Math.max(300, resizeStart.width + deltaX),
          height: Math.max(200, resizeStart.height + deltaY),
        })
      }
      if (isPanning) {
        setPan({
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        })
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      setIsResizing(false)
      setIsPanning(false)
    }

    if (isDragging || isResizing || isPanning) {
      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging, isResizing, isPanning, dragStart, resizeStart, panStart])

  const togglePerProductTypeMode = () => {
    const newMode = !perProductTypeMode
    setPerProductTypeMode(newMode)
    try {
      localStorage.setItem(FLOAT_MODE_KEY, String(newMode))
    } catch (e) {
      console.error("Failed to save float mode:", e)
    }
  }

  const handleDragStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains("resize-handle")) return
    setIsDragging(true)
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    })
  }

  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsResizing(true)
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
    })
  }

  const handlePanStart = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsPanning(true)
      setPanStart({
        x: e.clientX - pan.x,
        y: e.clientY - pan.y,
      })
    }
  }

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.25, 3))
  }

  const handleZoomOut = () => {
    setZoom((prev) => {
      const newZoom = Math.max(prev - 0.25, 1)
      if (newZoom === 1) {
        setPan({ x: 0, y: 0 })
      }
      return newZoom
    })
  }

  const handleResetZoom = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    const newZoom = Math.max(1, Math.min(3, zoom + delta))

    if (newZoom === 1) {
      setZoom(1)
      setPan({ x: 0, y: 0 })
    } else {
      setZoom(newZoom)
    }
  }

  const toggleBackground = () => {
    setBackgroundMode((prev) => {
      if (prev === "transparent") return "pattern"
      if (prev === "pattern") return "chroma"
      if (prev === "chroma") return "black"
      return "transparent"
    })
  }

  const getBackgroundTitle = () => {
    if (backgroundMode === "transparent") return "Background: Transparent (click for pattern)"
    if (backgroundMode === "pattern") return "Background: Pattern (click for chroma green)"
    if (backgroundMode === "chroma") return "Background: Chroma Green (click for black)"
    return "Background: Black (click for transparent)"
  }

  const getImageSource = () => {
    switch (activeTab) {
      case "product":
        return getImageUrl(order.productImage, "other")
      case "mockup":
        return getCachedImageUrl(currentMockupUrl)
      case "design":
        return getCachedImageUrl(currentDesignUrl)
      case "customer":
        return getImageUrl(order.customerImage, "other")
      default:
        return null
    }
  }

  const getOriginalSource = () => {
    switch (activeTab) {
      case "product":
        return order.productImage
      case "mockup":
        return currentMockupUrl
      case "design":
        return currentDesignUrl
      case "customer":
        return order.customerImage
      default:
        return null
    }
  }

  const imageSrc = getImageSource()
  const originalSrc = getOriginalSource()

  if (!imageSrc) return null

  return (
    <div
      ref={floatingRef}
      className="fixed rounded-lg shadow-2xl border-2 border-gray-300 overflow-hidden z-50"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
      }}
    >
      {/* Header */}
      <div
        className="bg-gray-100 border-b border-gray-300 px-3 py-2 flex items-center justify-between cursor-move select-none"
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
          <span className="text-sm font-medium text-gray-700 capitalize">{activeTab}</span>
          {activeTab === "design" && designUrls.length > 1 && setDesignIndex && (
            <div className="flex items-center gap-1 ml-1" onMouseDown={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDesignIndex((safeDesignIndex - 1 + designUrls.length) % designUrls.length)}
                className="h-6 w-6 p-0 hover:bg-gray-200"
                title="Previous design"
              >
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <span className="text-xs text-gray-600 tabular-nums">
                {safeDesignIndex + 1}/{designUrls.length}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDesignIndex((safeDesignIndex + 1) % designUrls.length)}
                className="h-6 w-6 p-0 hover:bg-gray-200"
                title="Next design"
              >
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={toggleBackground}
            className={`h-6 w-6 p-0 hover:bg-gray-200 ${backgroundMode !== "transparent" ? "bg-gray-200" : ""}`}
            title={getBackgroundTitle()}
          >
            <Grid3x3 className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={togglePerProductTypeMode}
            className={`h-6 w-6 p-0 hover:bg-gray-200 ${perProductTypeMode ? "bg-blue-200" : ""}`}
            title={
              perProductTypeMode
                ? "Settings per product type (click to use global)"
                : "Global settings (click to use per product type)"
            }
          >
            <Layers className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleZoomOut}
            disabled={zoom <= 1}
            className="h-6 w-6 p-0 hover:bg-gray-200"
            title="Zoom out"
          >
            <ZoomOut className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleZoomIn}
            disabled={zoom >= 3}
            className="h-6 w-6 p-0 hover:bg-gray-200"
            title="Zoom in"
          >
            <ZoomIn className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleResetZoom}
            disabled={zoom === 1}
            className="h-6 w-6 p-0 hover:bg-gray-200"
            title="Reset zoom"
          >
            <Maximize2 className="h-3 w-3" />
          </Button>
          {originalSrc && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => window.open(originalSrc, "_blank")}
              className="h-6 w-6 p-0 hover:bg-gray-200"
              title="Open in new tab"
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Image Content */}
      <div
        ref={imageContainerRef}
        className="w-full h-[calc(100%-40px)] flex items-center justify-center p-2 overflow-hidden relative"
        onWheel={handleWheel}
        style={{
          cursor: zoom > 1 ? "grab" : "default",
          backgroundImage:
            backgroundMode === "pattern"
              ? "linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)"
              : "none",
          backgroundSize: backgroundMode === "pattern" ? "20px 20px" : "auto",
          backgroundPosition: backgroundMode === "pattern" ? "0 0, 0 10px, 10px -10px, -10px 0px" : "0 0",
          backgroundColor:
            backgroundMode === "pattern"
              ? "#f9fafb"
              : backgroundMode === "chroma"
                ? "#00ff00"
                : backgroundMode === "black"
                  ? "#000000"
                  : "transparent",
        }}
      >
        <div
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transition: isPanning ? "none" : "transform 0.1s ease-out",
          }}
          className="flex items-center justify-center"
        >
          <LazyImage
            key={`${order.itemId}-${activeTab}-${activeTab === "design" ? safeDesignIndex : activeTab === "mockup" ? safeMockupIndex : 0}-float`}
            src={imageSrc}
            alt={activeTab}
            eager
            className="max-w-full max-h-full object-contain select-none"
            fit="contain"
            fallbackSrc={`/placeholder.svg?height=400&width=600&text=${activeTab}`}
            draggable={false}
          />
        </div>
      </div>

      {/* Resize Handle */}
      <div
        className="resize-handle absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
        onMouseDown={handleResizeStart}
        style={{
          background: "linear-gradient(135deg, transparent 50%, #9ca3af 50%)",
        }}
      />
    </div>
  )
}
