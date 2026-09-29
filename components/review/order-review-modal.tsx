"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ALL_STATUSES } from "@/constants/statuses"
import { LazyImage } from "@/components/ui/lazy-image"
import { useApi } from "@/hooks/use-api"
import { useImageCache } from "@/hooks/use-image-cache"
import { refreshImages } from "@/hooks/use-image-refresh"
import { useDesignLinks } from "@/hooks/use-design-links"
import { googleSheetsClient } from "@/lib/google-sheets-client"
import {
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  AlertTriangle,
  Maximize,
  Copy,
  CheckCheck,
  User,
  ChevronDown,
  Eye,
  EyeOff,
  AlertCircle,
  RefreshCw,
  FileSpreadsheet,
} from "lucide-react"
import type { Order } from "@/types/order"
import type {
  OrderReviewModalProps,
  ViewMode,
  ActiveTab,
  OrderHistoryResponse,
  ProductHistoryResponse,
  ProductTypeNoteResponse,
} from "@/types/order-review"
import { ImageViewer } from "./image-viewer"
import { KeyboardShortcuts } from "./keyboard-shortcuts"
import { OrderDetailsPanel } from "./order-details-panel"
import { STORAGE_KEY, DEFAULT_WIDTHS } from "@/constants/review-modal"
import { useOrderReviewPresence } from "@/hooks/use-order-review-presence"
// import { useGlobalPresence } from "@/hooks/use-global-presence"
import { PresenceAvatars } from "./presence-avatars"
import { copyVisibleImageToClipboard } from "@/utils/screenshot"

export function OrderReviewModal({
  isOpen,
  onClose,
  order,
  onAction,
  onOrderNoteUpdate,
  currentIndex,
  totalCount,
  selectedSheet,
  onNext,
  onPrevious,
  onJumpToIndex,
  availableStatuses,
  onStatusUpdate,
  reviewMode,
  isJumpLoading,
}: OrderReviewModalProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("float")
  const [activeTab, setActiveTab] = useState<ActiveTab>("mockup")
  const [zoom, setZoom] = useState(100)
  const [orderNote, setOrderNote] = useState("")
  const [repairType, setRepairType] = useState<"design_error" | "customer_change" | "">("")
  const [showRepairOptions, setShowRepairOptions] = useState(false)
  const [copiedItemId, setCopiedItemId] = useState(false)
  const [copiedPersonalization, setCopiedPersonalization] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [dragStartPan, setDragStartPan] = useState({ x: 0, y: 0 })
  const [screenshotTaken, setScreenshotTaken] = useState(false)
  const [currentStatus, setCurrentStatus] = useState<Order["status"]>(order.status)
  const [statusPickerOpen, setStatusPickerOpen] = useState(false)
  const [statusSearch, setStatusSearch] = useState("")
  const [columnWidths, setColumnWidths] = useState(DEFAULT_WIDTHS)
  const [isResizing, setIsResizing] = useState<"left" | "right" | null>(null)
  const [startX, setStartX] = useState(0)
  const [startWidths, setStartWidths] = useState(DEFAULT_WIDTHS)
  const [showOrderNoteImages, setShowOrderNoteImages] = useState(false)
  const [showCustomerImages, setShowCustomerImages] = useState(true)
  const [jumpItemId, setJumpItemId] = useState("")
  const [jumpError, setJumpError] = useState("")
  const [showChangesNotification, setShowChangesNotification] = useState(false)
  const [showItemIdChangeNotification, setShowItemIdChangeNotification] = useState(false)
  const [sheetGid, setSheetGid] = useState<string | null>(null)
  const imageContainerRef = useRef<HTMLDivElement>(null)
  const orderNoteTextareaRef = useRef<HTMLTextAreaElement>(null)

  const { preloadOrders, getCachedImageUrl } = useImageCache()
  const designUrls = useDesignLinks(order.designLink)
  const [designIndex, setDesignIndex] = useState(0)
  const mockupUrls = useDesignLinks(order.mockup)
  const [mockupIndex, setMockupIndex] = useState(0)

  const { reviewingUsers, setTypingStatus } = useOrderReviewPresence(order.itemId, isOpen)
  // const { onlineUsers } = useGlobalPresence(isOpen)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setColumnWidths(parsed)
      } catch (e) {
        console.error("Failed to parse saved column widths:", e)
      }
    }
  }, [])

  const saveColumnWidths = (widths: typeof columnWidths) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widths))
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

      const deltaX = e.clientX - startX
      const containerWidth = window.innerWidth
      const deltaPercent = (deltaX / containerWidth) * 100

      if (isResizing === "left") {
        const newLeftWidth = Math.max(15, Math.min(35, startWidths.left + deltaPercent))
        saveColumnWidths({ ...columnWidths, left: newLeftWidth })
      } else if (isResizing === "right") {
        const newRightWidth = Math.max(20, Math.min(40, startWidths.right - deltaPercent))
        saveColumnWidths({ ...columnWidths, right: newRightWidth })
      }
    }

    const handleMouseUp = () => {
      setIsResizing(null)
    }

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
  }, [isResizing, startX, startWidths, columnWidths])

  const {
    data: orderHistoryData,
    loading: orderHistoryLoading,
    error: orderHistoryError,
  } = useApi<OrderHistoryResponse>(`/orders/${order.itemId}/history`)

  const {
    data: productHistoryData,
    loading: productHistoryLoading,
    error: productHistoryError,
  } = useApi<ProductHistoryResponse>(
    order.productType && selectedSheet?.google_sheet_id
      ? `/orders/product-history/${order.productType}?google_sheet_id=${selectedSheet.google_sheet_id}`
      : "",
  )

  const {
    data: productTypeNoteData,
    loading: productTypeNoteLoading,
    error: productTypeNoteError,
    refetch: refetchProductTypeNote,
  } = useApi<ProductTypeNoteResponse>(
    order.productType ? `/product-type-notes/${encodeURIComponent(order.productType)}` : "",
  )

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange)
  }, [])

  useEffect(() => {
    const savedViewMode = localStorage.getItem("orderReviewViewMode") as ViewMode
    if (savedViewMode) {
      setViewMode(savedViewMode)
    } else {
      setViewMode("float")
      localStorage.setItem("orderReviewViewMode", "float")
    }
  }, [])

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem("orderReviewViewMode", mode)
  }

  useEffect(() => {
    setOrderNote(order.orderNote || "")
    setRepairType("")
    setShowRepairOptions(false)
    setZoom(100)
    setActiveTab("mockup")
    setDesignIndex(0)
    setMockupIndex(0)
    setPanX(0)
    setPanY(0)
    setRotation(0)
    setCurrentStatus(order.status)

    if (order._itemIdChanged) {
      setShowItemIdChangeNotification(true)
      setShowChangesNotification(false)
    } else if (order._changes) {
      setShowChangesNotification(true)
      setShowItemIdChangeNotification(false)
    } else {
      setShowChangesNotification(false)
      setShowItemIdChangeNotification(false)
    }
  }, [order.itemId, order.orderNote, order._changes, order._itemIdChanged])

  useEffect(() => {
    if (!reviewMode) return

    const index = reviewMode.currentIndex

    // The current order first — that warms its remaining designs/mockups, so paging
    // through them is instant — then the two orders after it.
    preloadOrders([reviewMode.orders[index], reviewMode.orders[index + 1], reviewMode.orders[index + 2]]).catch(
      (error) => console.error("[OrderReviewModal] Failed to preload images:", error),
    )
  }, [reviewMode, currentIndex, preloadOrders])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getStatusChangeDisplay = (entry: any, prevEntry?: any) => {
    if (!prevEntry) return `Order Created → ${entry.status}`
    return `${prevEntry.status} → ${entry.status}`
  }

  const getStatusBadge = (status: Order["status"]) => {
    switch (status) {
      case "DESIGNED":
        return (
          <Badge className="bg-blue-50 text-blue-700 border-blue-200">
            <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
            Designed
          </Badge>
        )
      case "NEED REPAIR":
        return (
          <Badge className="bg-red-50 text-red-700 border-red-200">
            <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
            Need Repair
          </Badge>
        )
      case "CONFIRMED":
        return (
          <Badge className="bg-green-50 text-green-700 border-green-200">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
            Confirmed
          </Badge>
        )
      case "REPAIRED":
        return (
          <Badge className="bg-green-50 text-green-700 border-green-200">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
            Repaired
          </Badge>
        )
      case "WAITING CUSTOMER":
        return (
          <Badge className="bg-yellow-50 text-yellow-700 border-yellow-200">
            <div className="w-2 h-2 bg-yellow-500 rounded-full mr-2"></div>
            Waiting Customer
          </Badge>
        )
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getImageUrl = (url: string | null, imageType: "design" | "mockup" | "other"): string | null => {
    if (!url) return null
    // Return original URL - cache system will handle Google Drive links
    return url
  }

  const handleDirectRepair = (type: "design_error" | "customer_change") => {
    const currentNoteValue = orderNoteTextareaRef.current?.value || ""
    const noteChanged = currentNoteValue !== (order.orderNote || "")
    const noteToSend = noteChanged ? currentNoteValue : order.orderNote
    onAction("need_repair", type, noteToSend)
  }

  const handleConfirm = () => {
    const currentNoteValue = orderNoteTextareaRef.current?.value || ""
    const noteChanged = currentNoteValue !== (order.orderNote || "")
    const noteToSend = noteChanged ? currentNoteValue : order.orderNote
    onAction("confirm", undefined, noteToSend)
  }

  const handleCopyItemId = async () => {
    try {
      await navigator.clipboard.writeText(order.itemId)
      setCopiedItemId(true)
      setTimeout(() => setCopiedItemId(false), 2000)
    } catch (error) {
      console.error("Failed to copy item ID:", error)
    }
  }

  const handleCopyPersonalization = async () => {
    if (!order.personalization) return
    try {
      await navigator.clipboard.writeText(order.personalization)
      setCopiedPersonalization(true)
      setTimeout(() => setCopiedPersonalization(false), 3000)
    } catch (error) {
      console.error("Failed to copy personalization:", error)
    }
  }

  useEffect(() => {
    if (!isOpen) return

    const isProduction = process.env.NODE_ENV === "production"
    if (!isProduction) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return

      switch (e.key) {
        case "1":
          e.preventDefault()
          handleConfirm()
          break
        case "r":
        case "R":
          e.preventDefault()
          setRotation((prev) => (prev + 90) % 360)
          break
        case "s":
        case "S":
          e.preventDefault()
          handleScreenshot()
          break
        case "a":
        case "A":
          e.preventDefault()
          handleCopyItemId()
          break
        case " ":
          e.preventDefault()
          if (e.shiftKey) {
            onPrevious()
          } else {
            onNext()
          }
          break
        case "Escape":
          e.preventDefault()
          if (showRepairOptions) {
            setShowRepairOptions(false)
          } else {
            onClose()
          }
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
        case "i":
        case "I":
          e.preventDefault()
          setActiveTab("customer")
          break
        case "f":
        case "F":
          e.preventDefault()
          toggleFullscreen()
          break
        case "h":
        case "H":
          e.preventDefault()
          scrollToProductHistory()
          break
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, showRepairOptions, viewMode, onNext, onPrevious, onClose])

  const handleNeedRepair = () => {
    if (!repairType) return
    const noteChanged = orderNote !== (order.orderNote || "")
    onAction("need_repair")
    setShowRepairOptions(false)
  }

  const scrollToProductHistory = () => {
    const element = document.getElementById("product-history-section")
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  const handleStatusChange = (newStatus: string) => {
    const typedStatus = newStatus as Order["status"]

    if (typedStatus === currentStatus) {
      return // No change needed
    }

    setCurrentStatus(typedStatus)

    if (typedStatus === "NEED REPAIR") {
      // Show modal to select change type
      // setSelectedNewStatus(typedStatus)
      // setStatusChangeNote(order.orderNote || "")
      // setStatusChangeType(null)
      // setShowStatusChangeModal(true)
    } else {
      const noteChanged = orderNote !== (order.orderNote || "")
      const noteToUpdate = noteChanged ? orderNote : order.orderNote
      onStatusUpdate(typedStatus, noteToUpdate)
    }
  }

  const handleConfirmStatusChange = () => {
    // if (!selectedNewStatus) return
    // if (selectedNewStatus === "NEED_REPAIR" && !statusChangeType) {
    //   return // Change type is required for NEED_REPAIR
    // }
    // onStatusUpdate(selectedNewStatus, statusChangeNote, statusChangeType || undefined)
    // setShowStatusChangeModal(false)
    // setSelectedNewStatus(null)
    // setStatusChangeNote("")
    // setStatusChangeType(null)
  }

  const handleCancelStatusChange = () => {
    // setCurrentStatus(order.status)
    // setShowStatusChangeModal(false)
    // setSelectedNewStatus(null)
    // setStatusChangeNote("")
    // setStatusChangeType(null)
  }

  const handleScreenshot = async () => {
    if (!imageContainerRef.current) return

    copyVisibleImageToClipboard(imageContainerRef.current, () => {
      // Show animation
      setScreenshotTaken(true)
      setTimeout(() => setScreenshotTaken(false), 1000)
    })
  }

  const extractImageUrls = (content: string) => {
    if (!content) return []
    const urlRegex = /(https?:\/\/[^\s]+)/g
    const urls = content.match(urlRegex) || []
    return urls.filter((url) => /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(url))
  }

  const handleOpenAllImages = () => {
    // const imageUrls = extractImageUrls(productTypeNote)
    // imageUrls.forEach((url) => {
    //   window.open(url, "_blank")
    // })
  }

  const handleSaveProductNote = async () => {
    // if (!order.productType) return
    // setProductNoteLoading(true)
    // try {
    //   const response = await fetch(`/api/product-type-notes/${encodeURIComponent(order.productType)}`, {
    //     method: "POST",
    //     headers: {
    //       "Content-Type": "application/json",
    //     },
    //     body: JSON.stringify({
    //       content: productTypeNote,
    //     }),
    //   })
    //   if (response.ok) {
    //     setIsEditingProductNote(false)
    //     refetchProductTypeNote()
    //   } else {
    //     console.error("Failed to save product type note")
    //   }
    // } catch (error) {
    //   console.error("Error saving product type note:", error)
    // } finally {
    //   setProductNoteLoading(false)
    // }
  }

  const handleCancelEditProductNote = () => {
    // setProductTypeNote(productTypeNoteData?.data?.content || "")
    // setIsEditingProductNote(false)
  }

  const handleJumpToOrder = () => {
    if (!jumpItemId.trim() || !reviewMode) {
      setJumpError("Please enter an item ID")
      return
    }

    const targetIndex = reviewMode.orders.findIndex((o) => o.itemId.toLowerCase() === jumpItemId.trim().toLowerCase())

    if (targetIndex === -1) {
      setJumpError("Order not found in current list")
      return
    }

    // Clear error and input
    setJumpError("")
    setJumpItemId("")

    // Jump directly to the target order using the parent's handler
    onJumpToIndex(targetIndex)
  }

  const handleJumpKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleJumpToOrder()
    } else if (e.key === "Escape") {
      setJumpItemId("")
      setJumpError("")
    }
  }

  const getFieldLabel = (field: string): string => {
    const labels: Record<string, string> = {
      status: "Status",
      orderNote: "Order Note",
      designer: "Designer",
      designLink: "Design Link",
      mockup: "Mockup",
      customerImage: "Customer Image",
      personalization: "Personalization",
      productType: "Product Type",
      productName: "Product Name",
      store: "Store",
      productImage: "Product Image",
    }
    return labels[field] || field
  }

  const getSheetCellUrl = () => {
    if (!selectedSheet || !order.rowPosition || !sheetGid) return null

    // Generate URL that links to the specific row in Google Sheets
    // Format: https://docs.google.com/spreadsheets/d/{google_sheet_id}/edit#gid={sheetGid}&range=A{row}
    const baseUrl = `https://docs.google.com/spreadsheets/d/${selectedSheet.google_sheet_id}/edit`
    const range = `A${order.rowPosition}`

    return `${baseUrl}#gid=${sheetGid}&range=${range}`
  }

  useEffect(() => {
    const fetchSheetGid = async () => {
      if (!selectedSheet?.google_sheet_id || !selectedSheet?.tab_name) {
        setSheetGid(null)
        return
      }

      try {
        const result = await googleSheetsClient.getSheetTabs(selectedSheet.google_sheet_id)
        if (result.success && result.data) {
          const tab = result.data.find((t: any) => t.title === selectedSheet.tab_name)
          if (tab) {
            setSheetGid(tab.id.toString())
          }
        }
      } catch (error) {
        console.error("[OrderReviewModal] Failed to fetch sheet gid:", error)
      }
    }

    fetchSheetGid()
  }, [selectedSheet?.google_sheet_id, selectedSheet?.tab_name])

  const handleOrderNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setOrderNote(e.target.value)
    setTypingStatus()
  }

  const hasMultipleReviewers = reviewingUsers.length > 0

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className={`max-w-none max-h-none w-screen h-screen overflow-hidden p-0 m-0 ${
          hasMultipleReviewers ? "ring-4 ring-purple-500 ring-opacity-50" : ""
        }`}
      >
        <DialogTitle className="sr-only">
          Order Review - {order?.itemId || "Loading..."}
        </DialogTitle>
        {/* Header */}
        <div
          className={`flex items-center justify-between px-4 py-2 border-b border-gray-200 ${
            hasMultipleReviewers ? "bg-purple-100 border-purple-300" : "bg-white"
          }`}
        >
          <div className="flex items-center gap-3">
            {hasMultipleReviewers && (
              <div className="flex items-center gap-2 px-3 py-1 bg-purple-600 text-white rounded-md text-xs font-semibold animate-pulse">
                <AlertTriangle className="h-4 w-4" />
                <span>Multiple Reviewers Detected</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <h2 className={`text-lg font-semibold ${hasMultipleReviewers ? "text-purple-900" : "text-gray-900"}`}>
                #{order.itemId}
              </h2>
              <Button variant="ghost" size="sm" onClick={handleCopyItemId} className="h-6 w-6 p-0 hover:bg-gray-100">
                {copiedItemId ? (
                  <CheckCheck className="h-3 w-3 text-green-600" />
                ) : (
                  <Copy className="h-3 w-3 text-gray-500" />
                )}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Popover modal={false} open={statusPickerOpen} onOpenChange={(open) => { setStatusPickerOpen(open); if (!open) setStatusSearch("") }}>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1 rounded hover:bg-gray-100 px-1 py-0.5 transition-colors">
                    {getStatusBadge(currentStatus)}
                    <ChevronDown className="h-3 w-3 text-gray-400" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-56 p-0">
                  <div className="p-2 border-b">
                    <input
                      autoFocus
                      placeholder="Tìm status..."
                      value={statusSearch}
                      onChange={(e) => setStatusSearch(e.target.value)}
                      className="w-full text-sm px-2 py-1 rounded border border-gray-200 outline-none focus:border-blue-400"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto py-1" onWheel={(e) => e.stopPropagation()}>
                    {ALL_STATUSES
                      .filter((s) => s.toLowerCase().includes(statusSearch.toLowerCase()))
                      .map((status) => (
                        <button
                          key={status}
                          className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 text-left"
                          onClick={() => { handleStatusChange(status); setStatusPickerOpen(false); setStatusSearch("") }}
                        >
                          {getStatusBadge(status)}
                        </button>
                      ))}
                    {ALL_STATUSES.filter((s) => s.toLowerCase().includes(statusSearch.toLowerCase())).length === 0 && (
                      <p className="text-xs text-gray-400 px-3 py-2">Không tìm thấy</p>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <span className="text-sm text-gray-500">
              {currentIndex + 1}/{totalCount}
            </span>

            {/* Jump to order input */}
            <div className="flex items-center gap-2 ml-4 border-l pl-4 border-gray-200">
              <div className="relative">
                <input
                  type="text"
                  value={jumpItemId}
                  onChange={(e) => {
                    setJumpItemId(e.target.value)
                    setJumpError("")
                  }}
                  onKeyDown={handleJumpKeyDown}
                  placeholder="Jump to Item ID..."
                  disabled={isJumpLoading}
                  className="h-7 px-2 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-72 disabled:bg-gray-50 disabled:cursor-not-allowed"
                />
                {jumpError && (
                  <div className="absolute top-full left-0 mt-1 text-xs text-red-600 whitespace-nowrap bg-white px-2 py-1 rounded shadow-sm border border-red-200">
                    {jumpError}
                  </div>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleJumpToOrder}
                disabled={isJumpLoading}
                className="h-7 px-2 text-xs bg-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                title="Jump to order by Item ID"
              >
                Go
              </Button>
              {isJumpLoading && <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />}
            </div>

            <PresenceAvatars users={reviewingUsers} label="reviewing" maxDisplay={5} />
          </div>

          <div className="flex items-center gap-2">
            {getSheetCellUrl() && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(getSheetCellUrl()!, "_blank")}
                title="Open in Google Sheets"
              >
                <FileSpreadsheet className="h-4 w-4" />
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={refreshImages} title="Tải lại ảnh (design / mockup / product)">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={toggleFullscreen} title="Toggle Fullscreen (F)">
              <Maximize className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={onPrevious} disabled={currentIndex === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={onNext} disabled={currentIndex === totalCount - 1}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {showItemIdChangeNotification && order._itemIdChanged && (
          <div className="bg-red-50 border-b border-red-200 px-4 py-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-red-900 mb-1">Row Changed - Different Order Detected</p>
                <div className="text-xs text-red-800">
                  <span className="font-medium">Expected Item ID:</span>{" "}
                  <span className="font-mono bg-red-100 px-1.5 py-0.5 rounded">{order._itemIdChanged}</span>
                  {" → "}
                  <span className="font-medium">Current Item ID:</span>{" "}
                  <span className="font-mono bg-red-100 px-1.5 py-0.5 rounded font-semibold">{order.itemId}</span>
                </div>
                <p className="text-xs text-red-700 mt-2">
                  The sheet data at this row has been updated with a different order. Please check the sheet to verify.
                </p>
                {getSheetCellUrl() && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(getSheetCellUrl()!, "_blank")}
                    className="mt-2 h-7 text-xs bg-white border-red-300 text-red-700 hover:bg-red-100 hover:text-red-800"
                  >
                    <FileSpreadsheet className="h-3 w-3 mr-1.5" />
                    Open Sheet
                  </Button>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowItemIdChangeNotification(false)}
                className="h-5 w-5 p-0 hover:bg-red-100"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        {showChangesNotification && order._changes && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-900 mb-1">Data Updated from Sheet</p>
                <div className="space-y-1">
                  {Object.entries(order._changes).map(([field, change]) => (
                    <div key={field} className="text-xs text-amber-800">
                      <span className="font-medium">{getFieldLabel(field)}:</span>{" "}
                      <span className="line-through text-amber-600">{change.old || "(empty)"}</span>
                      {" → "}
                      <span className="font-semibold text-amber-900">{change.new || "(empty)"}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-amber-700 mt-2">
                  Changes detected from sheet. Click below to view in Google Sheets.
                </p>
                {getSheetCellUrl() && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(getSheetCellUrl()!, "_blank")}
                    className="mt-2 h-7 text-xs bg-white border-amber-300 text-amber-700 hover:bg-amber-100 hover:text-amber-800"
                  >
                    <FileSpreadsheet className="h-3 w-3 mr-1.5" />
                    Open Sheet
                  </Button>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowChangesNotification(false)}
                className="h-5 w-5 p-0 hover:bg-amber-100"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

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
                  <button
                    onClick={() => handleViewModeChange("tabs")}
                    className={`px-2 py-1 rounded text-xs transition-colors ${
                      viewMode === "tabs" ? "bg-blue-100 text-blue-700" : "bg-white text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    Tabs
                  </button>
                  <button
                    onClick={() => handleViewModeChange("stack")}
                    className={`px-2 py-1 rounded text-xs transition-colors ${
                      viewMode === "stack" ? "bg-blue-100 text-blue-700" : "bg-white text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    Stack
                  </button>
                  <button
                    onClick={() => handleViewModeChange("float")}
                    className={`px-2 py-1 rounded text-xs transition-colors ${
                      viewMode === "float" ? "bg-blue-100 text-blue-700" : "bg-white text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    Float
                  </button>
                </div>
              </div>

              {/* Confirm Button */}
              <div className="flex gap-2">
                <Button
                  onClick={handleConfirm}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm py-2 shadow-sm transition-all duration-200 hover:shadow-md"
                >
                  <Check className="h-4 w-4 mr-2" />
                  CONFIRM (1)
                </Button>
              </div>

              {/* Order Note Section */}
              <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-purple-900">1. Order Note</h3>
                  {extractImageUrls(orderNote).length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowOrderNoteImages(!showOrderNoteImages)}
                      className="h-5 w-5 p-0 hover:bg-purple-100"
                      title={showOrderNoteImages ? "Hide images" : "Show images"}
                    >
                      {showOrderNoteImages ? (
                        <EyeOff className="h-3 w-3 text-purple-700" />
                      ) : (
                        <Eye className="h-3 w-3 text-purple-700" />
                      )}
                    </Button>
                  )}
                </div>
                <Textarea
                  ref={orderNoteTextareaRef}
                  value={orderNote}
                  onChange={handleOrderNoteChange}
                  placeholder="Add or edit order note..."
                  className="min-h-[60px] text-xs bg-white"
                  disabled={true}
                />
                {showOrderNoteImages && extractImageUrls(orderNote).length > 0 && (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-purple-700 font-medium">Images in note:</p>
                    <div className="space-y-2">
                      {extractImageUrls(orderNote).map((url, index) => (
                        <div key={index} className="relative">
                          <LazyImage
                            src={url}
                            alt={`Order note image ${index + 1}`}
                            className="w-full h-auto object-contain rounded border border-purple-200 cursor-pointer"
                            fit="contain"
                            onClick={() => window.open(url, "_blank")}
                            fallbackSrc="/placeholder.svg?height=200&width=200&text=Image"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {orderNote !== (order.orderNote || "") && (
                  <p className="text-xs text-purple-600 italic mt-2">* Order note has been modified</p>
                )}
              </div>

              {/* Personalization */}
              {order.personalization && (
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-xs font-semibold text-blue-900">2. Personalization</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyPersonalization}
                      className="h-5 w-5 p-0 hover:bg-blue-100"
                      title="Copy personalization text"
                    >
                      {copiedPersonalization ? (
                        <CheckCheck className="h-3 w-3 text-green-600" />
                      ) : (
                        <Copy className="h-3 w-3 text-blue-700" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-blue-800 leading-relaxed whitespace-pre-wrap">{order.personalization}</p>
                </div>
              )}

              {/* Customer Image */}
              {order.customerImage && (
                <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-green-900">3. Customer Image</h3>
                    {extractImageUrls(order.customerImage).length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowCustomerImages(!showCustomerImages)}
                        className="h-5 w-5 p-0 hover:bg-green-100"
                        title={showCustomerImages ? "Hide images" : "Show images"}
                      >
                        {showCustomerImages ? (
                          <EyeOff className="h-3 w-3 text-green-700" />
                        ) : (
                          <Eye className="h-3 w-3 text-green-700" />
                        )}
                      </Button>
                    )}
                  </div>
                  {showCustomerImages && (
                    <div className="w-full space-y-2">
                      {extractImageUrls(order.customerImage).length > 0 ? (
                        extractImageUrls(order.customerImage).map((url, index) => (
                          <div key={index} className="relative">
                            <LazyImage
                              src={getCachedImageUrl(url) || url}
                              alt={`Customer Image ${index + 1}`}
                              className="w-full h-auto object-contain rounded border border-green-200 cursor-pointer"
                              fit="contain"
                              onClick={() => window.open(url, "_blank")}
                              fallbackSrc="/placeholder.svg?height=200&width=200&text=Customer+Image"
                            />
                          </div>
                        ))
                      ) : (
                        <LazyImage
                          src={getCachedImageUrl(order.customerImage) || order.customerImage}
                          alt="Customer Reference"
                          className="w-full h-auto object-contain rounded border border-green-200 cursor-pointer"
                          fit="contain"
                          onClick={() => window.open(order.customerImage, "_blank")}
                          fallbackSrc="/placeholder.svg?height=200&width=200&text=Customer+Image"
                        />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Design Error and Customer Change buttons */}
              <div className="flex gap-2">
                <Button
                  onClick={() => handleDirectRepair("design_error")}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm py-2 shadow-sm transition-all duration-200 hover:shadow-md"
                >
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  DESIGN ERROR
                </Button>
                <Button
                  onClick={() => handleDirectRepair("customer_change")}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-sm py-2 shadow-sm transition-all duration-200 hover:shadow-md"
                >
                  <User className="h-4 w-4 mr-2" />
                  CUSTOMER
                </Button>
              </div>

              <KeyboardShortcuts />
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
          </div>

          {/* Right Panel - Order Details */}
          <div
            className="border-l border-gray-200 bg-white overflow-y-auto relative"
            style={{ width: `${columnWidths.right}%` }}
          >
            <div
              className="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-blue-500 hover:w-1.5 transition-all z-10"
              onMouseDown={(e) => handleMouseDown(e, "right")}
              title="Drag to resize"
            />

            <OrderDetailsPanel
              order={order}
              currentStatus={currentStatus}
              orderHistoryData={orderHistoryData}
              orderHistoryLoading={orderHistoryLoading}
              orderHistoryError={orderHistoryError}
              productHistoryData={productHistoryData}
              productHistoryLoading={productHistoryLoading}
              productHistoryError={productHistoryError}
              productTypeNoteData={productTypeNoteData}
              productTypeNoteLoading={productTypeNoteLoading}
              productTypeNoteError={productTypeNoteError}
              refetchProductTypeNote={refetchProductTypeNote}
              getCachedImageUrl={getCachedImageUrl}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
