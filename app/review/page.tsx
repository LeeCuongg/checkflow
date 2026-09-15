"use client"

import { useRouter } from "next/navigation"
import { useOrderData } from "@/hooks/use-order-data"
import { useMeraProjects } from "@/hooks/use-mera-projects"
import { useMeraOrders } from "@/hooks/use-mera-orders"
import { useMeraMutations } from "@/hooks/use-mera-mutations"
import { adaptMeraOrders } from "@/lib/mera-adapter"
import { SheetSelector } from "@/components/review/sheet-selector"
import { MeraProjectSelector } from "@/components/review/mera-project-selector"
import { OrderListHeader } from "@/components/review/order-list-header"
import { OrderList } from "@/components/review/order-list"
import { SyncStatusIndicator } from "@/components/sync-status-indicator"
import type { Order } from "@/types/order"
import type { MeraOrder, MeraListOrdersParams } from "@/types/mera-order"
import { useState, useEffect, useMemo } from "react"
import { useToast } from "@/hooks/use-toast"
import { OrderReviewModal } from "@/components/review/order-review-modal"
import { googleSheetsClient } from "@/lib/google-sheets-client"
import { clearResolvedDesignLinks } from "@/utils/design-links"
import { RefreshCw, Database, Sheet } from "lucide-react"

type DataSource = "sheets" | "mera"

// Reverse map: CheckFlow status → Mera status for item PATCH
const CHECKFLOW_TO_MERA_STATUS: Record<string, string> = {
  DESIGNED: "DESIGNED",
  DESIGNING: "DESIGNING",
  CONFIRMED: "CONFIRMED",
  "NEED REPAIR": "NEED REPAIR",
  NEED_REPAIR: "NEED REPAIR",
  REPAIRED: "REPAIRED",
}

export default function ReviewPage() {
  const router = useRouter()
  const { toast } = useToast()

  // ── Source toggle ──────────────────────────────────────────────────────────
  const [dataSource, setDataSource] = useState<DataSource>("sheets")

  // ── Mera state ────────────────────────────────────────────────────────────
  const [meraProjectId, setMeraProjectId] = useState<string>("")
  const [meraParams, setMeraParams] = useState<MeraListOrdersParams>({
    page: 1,
    page_size: 500,
    include_items: true,
  })
  const { projects: meraProjects, loading: meraProjectsLoading } = useMeraProjects({ enabled: dataSource === "mera" })
  const {
    orders: rawMeraOrders,
    total: meraTotal,
    page: meraPage,
    page_size: merPageSize,
    total_pages: meraTotalPages,
    status_counts: meraStatusCounts,
    loading: meraLoading,
    error: meraError,
    refetch: meraRefetch,
  } = useMeraOrders(
    dataSource === "mera" ? { ...meraParams, project_id: meraProjectId || undefined } : { page: 1, page_size: 1 },
    { enabled: dataSource === "mera" }
  )
  const { patchItem: meraPatchItem } = useMeraMutations()

  const meraOrders = useMemo(
    () => (dataSource === "mera" ? adaptMeraOrders(rawMeraOrders) : []),
    [dataSource, rawMeraOrders]
  )

  // ── Mera filter options (derived from current page of mera orders) ────────
  const meraFilterOptions = useMemo(() => {
    if (dataSource !== "mera") return { statuses: [], designers: [], productTypes: [], stores: [] }
    const statuses = [...new Set(meraOrders.map((o) => o.status))]
    // Also include statuses from status_counts that may not be on current page
    Object.keys(meraStatusCounts).forEach((s) => {
      if (!statuses.includes(s)) statuses.push(s)
    })
    const allDesigners = meraOrders.map((o) => o.designer)
    const hasBlank = allDesigners.some((d) => !d || d.trim() === "")
    const nonBlank = [...new Set(allDesigners.filter((d): d is string => !!d && d.trim() !== ""))]
    const designers = hasBlank ? ["[Blank]", ...nonBlank] : nonBlank
    return {
      statuses,
      designers,
      productTypes: [...new Set(meraOrders.map((o) => o.productType).filter(Boolean))] as string[],
      stores: [...new Set(meraOrders.map((o) => o.store).filter(Boolean))] as string[],
    }
  }, [dataSource, meraOrders, meraStatusCounts])

  const meraDerivedStatusCounts = useMemo(() => {
    if (dataSource !== "mera") return {}
    // Use server-provided status_counts if available, otherwise compute from orders
    if (Object.keys(meraStatusCounts).length > 0) return meraStatusCounts
    const counts: Record<string, number> = {}
    meraOrders.forEach((o) => { counts[o.status] = (counts[o.status] || 0) + 1 })
    return counts
  }, [dataSource, meraOrders, meraStatusCounts])

  // ── Sheets state ──────────────────────────────────────────────────────────
  const {
    orders,
    allOrders, // Added allOrders to get all orders regardless of pagination
    sheets,
    selectedSheet,
    loading,
    error,
    totalCount,
    filteredCount,
    filters,
    filterOptions,
    lastSync,
    loadingTime,
    pagination,
    syncStatus,
    syncError,
    pendingChanges,
    triggerManualSync,
    loadOrdersFromSheet,
    applyFilters,
    refreshData,
    changePageSize,
    changePage,
    updateOrderStatus,
    reloadOrderFromSheet, // Import the new reload function
  } = useOrderData({ enabled: dataSource === "sheets" })

  const meraDerivedFilteredCounts = useMemo(() => {
    const designerCounts: Record<string, number> = {}
    const productTypeCounts: Record<string, number> = {}
    const storeCounts: Record<string, number> = {}
    if (dataSource !== "mera") return { designerCounts, productTypeCounts, storeCounts }

    const matchesDesigner = (o: Order) => {
      if (!filters.designer?.length) return true
      const hasBlank = filters.designer.includes("[Blank]")
      const others = filters.designer.filter((d) => d !== "[Blank]")
      const isBlank = !o.designer || o.designer.trim() === ""
      return isBlank ? hasBlank : others.includes(o.designer!)
    }

    // Designer counts: apply status + productType + store filters (NOT designer)
    meraOrders.forEach((o) => {
      if (filters.status?.length && !filters.status.includes(o.status)) return
      if (filters.productType?.length && !filters.productType.includes(o.productType!)) return
      if (filters.store?.length && !filters.store.includes(o.store!)) return
      if (o.designer && o.designer.trim() !== "") {
        designerCounts[o.designer] = (designerCounts[o.designer] || 0) + 1
      } else {
        designerCounts["[Blank]"] = (designerCounts["[Blank]"] || 0) + 1
      }
    })

    // Product type counts: apply status + designer + store filters (NOT productType)
    meraOrders.forEach((o) => {
      if (filters.status?.length && !filters.status.includes(o.status)) return
      if (!matchesDesigner(o)) return
      if (filters.store?.length && !filters.store.includes(o.store!)) return
      if (o.productType) productTypeCounts[o.productType] = (productTypeCounts[o.productType] || 0) + 1
    })

    // Store counts: apply status + designer + productType filters (NOT store)
    meraOrders.forEach((o) => {
      if (filters.status?.length && !filters.status.includes(o.status)) return
      if (!matchesDesigner(o)) return
      if (filters.productType?.length && !filters.productType.includes(o.productType!)) return
      if (o.store) storeCounts[o.store] = (storeCounts[o.store] || 0) + 1
    })

    return { designerCounts, productTypeCounts, storeCounts }
  }, [dataSource, meraOrders, filters])

  const filteredMeraOrders = useMemo(() => {
    if (dataSource !== "mera") return meraOrders
    return meraOrders.filter((order) => {
      if (filters.status?.length && !filters.status.includes(order.status)) return false
      if (filters.designer?.length) {
        const hasBlank = filters.designer.includes("[Blank]")
        const others = filters.designer.filter((d) => d !== "[Blank]")
        const isBlank = !order.designer || order.designer.trim() === ""
        if (isBlank && !hasBlank) return false
        if (!isBlank && !others.includes(order.designer!)) return false
      }
      if (filters.productType?.length && !filters.productType.includes(order.productType!)) return false
      if (filters.store?.length && !filters.store.includes(order.store!)) return false
      if (filters.searchQuery) {
        const q = filters.searchQuery.toLowerCase()
        const text = [order.itemId, order.orderNote, order.personalization, order.productName, order.designer, order.store]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        if (!text.includes(q)) return false
      }
      return true
    })
  }, [meraOrders, filters, dataSource])

  // Active orders depending on source
  const activeOrders = dataSource === "mera" ? filteredMeraOrders : orders
  const activeLoading = dataSource === "mera" ? meraLoading : loading
  const activeError = dataSource === "mera" ? meraError : error

  const [reviewMode, setReviewMode] = useState<{
    isActive: boolean
    currentIndex: number
    orders: Order[]
  } | null>(null)

  const [isLoadingNewSheet, setIsLoadingNewSheet] = useState(false)
  const [isJumpLoading, setIsJumpLoading] = useState(false) // Added loading state for jumping to orders

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    allOrders.forEach((order) => {
      if (order.status) {
        counts[order.status] = (counts[order.status] || 0) + 1
      }
    })
    return counts
  }, [allOrders])

  const filteredCounts = useMemo(() => {
    const designerCounts: Record<string, number> = {}
    const productTypeCounts: Record<string, number> = {}
    const storeCounts: Record<string, number> = {}

    // For designer counts: apply all filters EXCEPT designer filter
    const ordersForDesignerCount = allOrders.filter((order) => {
      if (filters.status && filters.status.length > 0 && !filters.status.includes(order.status)) {
        return false
      }
      // Skip designer filter when calculating designer counts
      if (filters.productType && filters.productType.length > 0 && !filters.productType.includes(order.productType ?? "")) {
        return false
      }
      if (filters.store && filters.store.length > 0 && !filters.store.includes(order.store ?? "")) {
        return false
      }
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase()
        const searchableText = [
          order.itemId,
          order.orderNote,
          order.personalization,
          order.productName,
          order.designer,
          order.store,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()

        if (!searchableText.includes(query)) {
          return false
        }
      }
      return true
    })

    // For productType counts: apply all filters EXCEPT productType filter
    const ordersForProductTypeCount = allOrders.filter((order) => {
      if (filters.status && filters.status.length > 0 && !filters.status.includes(order.status)) {
        return false
      }
      if (filters.designer && filters.designer.length > 0) {
        const hasBlankFilter = filters.designer.includes("[Blank]")
        const otherDesigners = filters.designer.filter((d) => d !== "[Blank]")

        const orderHasBlankDesigner = !order.designer || order.designer.trim() === ""

        if (orderHasBlankDesigner) {
          if (!hasBlankFilter) return false
        } else {
          if (!otherDesigners.includes(order.designer ?? "")) return false
        }
      }
      // Skip productType filter when calculating productType counts
      if (filters.store && filters.store.length > 0 && !filters.store.includes(order.store ?? "")) {
        return false
      }
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase()
        const searchableText = [
          order.itemId,
          order.orderNote,
          order.personalization,
          order.productName,
          order.designer,
          order.store,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()

        if (!searchableText.includes(query)) {
          return false
        }
      }
      return true
    })

    // For store counts: apply all filters EXCEPT store filter
    const ordersForStoreCount = allOrders.filter((order) => {
      if (filters.status && filters.status.length > 0 && !filters.status.includes(order.status)) {
        return false
      }
      if (filters.designer && filters.designer.length > 0) {
        const hasBlankFilter = filters.designer.includes("[Blank]")
        const otherDesigners = filters.designer.filter((d) => d !== "[Blank]")

        const orderHasBlankDesigner = !order.designer || order.designer.trim() === ""

        if (orderHasBlankDesigner) {
          if (!hasBlankFilter) return false
        } else {
          if (!otherDesigners.includes(order.designer ?? "")) return false
        }
      }
      if (filters.productType && filters.productType.length > 0 && !filters.productType.includes(order.productType ?? "")) {
        return false
      }
      // Skip store filter when calculating store counts
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase()
        const searchableText = [
          order.itemId,
          order.orderNote,
          order.personalization,
          order.productName,
          order.designer,
          order.store,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()

        if (!searchableText.includes(query)) {
          return false
        }
      }
      return true
    })

    ordersForDesignerCount.forEach((order) => {
      if (order.designer && order.designer.trim() !== "") {
        designerCounts[order.designer] = (designerCounts[order.designer] || 0) + 1
      } else {
        // Count blank designers with the special marker
        designerCounts["[Blank]"] = (designerCounts["[Blank]"] || 0) + 1
      }
    })

    // Count product types from filtered orders (excluding productType filter)
    ordersForProductTypeCount.forEach((order) => {
      if (order.productType) {
        productTypeCounts[order.productType] = (productTypeCounts[order.productType] || 0) + 1
      }
    })

    // Count stores from filtered orders (excluding store filter)
    ordersForStoreCount.forEach((order) => {
      if (order.store) {
        storeCounts[order.store] = (storeCounts[order.store] || 0) + 1
      }
    })

    return { designerCounts, productTypeCounts, storeCounts }
  }, [allOrders, filters])

  useEffect(() => {
    if (dataSource !== "sheets") return
    const refreshTokensOnLoad = async () => {
      try {
        console.log("[ReviewPage] Refreshing tokens on page load...")
        await googleSheetsClient.getValidAccessToken()
        console.log("[ReviewPage] Token refresh completed successfully")
      } catch (error) {
        console.error("[ReviewPage] Token refresh failed on page load:", error)
      }
    }

    refreshTokensOnLoad()
  }, [dataSource])

  const handleSheetSelect = async (sheet: any) => {
    console.log("[ReviewPage] Sheet selected:", sheet.name)
    setIsLoadingNewSheet(true)

    try {
      await loadOrdersFromSheet(sheet)
    } finally {
      setIsLoadingNewSheet(false)
    }
  }

  const handleMeraRefresh = () => {
    clearResolvedDesignLinks()
    meraRefetch()
  }

  const handleSheetsRefresh = async () => {
    clearResolvedDesignLinks()
    await refreshData()
  }

  const handleStartSequentialReview = () => {
    if (activeOrders.length === 0) return

    setReviewMode({
      isActive: true,
      currentIndex: 0,
      orders: activeOrders,
    })
  }

  // Mera-specific status update (item PATCH)
  const handleMeraStatusUpdate = async (
    order: Order & { _mera?: MeraOrder },
    newStatus: Order["status"],
    note?: string,
    changeType?: "design_error" | "customer_change",
  ): Promise<boolean> => {
    const meraOrder = order._mera
    if (!meraOrder) return false

    // For split-item orders, find the specific item matching this CheckFlow entry
    const item = meraOrder.items?.find((i) => i.item_key === order.itemId) ?? meraOrder.items?.[0]
    if (!item) return false

    const meraStatus = CHECKFLOW_TO_MERA_STATUS[newStatus] ?? newStatus

    const applySuccess = (updatedItem: { item_key: string; version: number }) => {
      setReviewMode((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          orders: prev.orders.map((o) => {
            if (o.itemId !== order.itemId) return o
            const mera = (o as Order & { _mera?: MeraOrder })._mera
            if (!mera) return o
            return {
              ...o,
              status: newStatus,
              _mera: {
                ...mera,
                items: mera.items?.map((i) =>
                  i.item_key === updatedItem.item_key ? { ...i, version: updatedItem.version } : i
                ),
              },
            }
          }),
        }
      })
      meraRefetch()
    }

    // Retry loop: mỗi lần 409 lấy version mới từ response và thử lại (tối đa 3 lần)
    let version = item.version
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const updatedItem = await meraPatchItem(
          item.item_key,
          {
            version,
            status: meraStatus,
            ...(changeType ? { change_type: changeType } : {}),
            ...(note !== undefined ? { order_note: note } : {}),
          } as unknown as Parameters<typeof meraPatchItem>[1],
        )
        applySuccess(updatedItem)
        return true
      } catch (err) {
        const e = err as { isVersionConflict?: boolean; latest?: { item_key: string; version: number } }
        if (e.isVersionConflict && e.latest) {
          version = e.latest.version
          continue
        }
        break
      }
    }

    toast({
      title: "Không thể cập nhật trạng thái",
      description: "Đơn đang được chỉnh sửa đồng thời. Vui lòng thử lại.",
      variant: "destructive",
    })
    return false
  }

  const handleReviewClose = () => {
    setReviewMode(null)
  }

  const handleReviewNext = async () => {
    if (!reviewMode || reviewMode.currentIndex >= reviewMode.orders.length - 1) return

    const nextIndex = reviewMode.currentIndex + 1
    const nextOrder = reviewMode.orders[nextIndex]

    if (dataSource === "mera") {
      // Dùng functional form để không ghi đè update version từ handleMeraStatusUpdate
      // Đồng thời sync version mới nhất từ activeOrders (đã được meraRefetch cập nhật)
      const latestOrder = activeOrders.find((o) => o.itemId === nextOrder.itemId)
      setReviewMode((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          currentIndex: nextIndex,
          orders: latestOrder
            ? prev.orders.map((o, i) => (i === nextIndex ? latestOrder : o))
            : prev.orders,
        }
      })
      return
    }

    setReviewMode((prev) => prev ? { ...prev, currentIndex: nextIndex } : prev)

    console.log(`[v0] Moving to next order ${nextOrder.itemId}, reloading data from sheet`)
    setIsJumpLoading(true)

    try {
      const reloadedOrder = await reloadOrderFromSheet(nextOrder.itemId)

      if (reloadedOrder) {
        const itemIdChanged = nextOrder.itemId !== reloadedOrder.itemId
        const changes = detectOrderChanges(nextOrder, reloadedOrder)

        setReviewMode((prev) => {
          if (!prev) return prev

          const updatedOrders = prev.orders.map((o) =>
            o.itemId === nextOrder.itemId
              ? { ...reloadedOrder, _changes: changes, _itemIdChanged: itemIdChanged ? nextOrder.itemId : undefined }
              : o,
          )

          return {
            ...prev,
            orders: updatedOrders,
          }
        })
      }
    } finally {
      setIsJumpLoading(false)
    }
  }

  const handleReviewPrevious = async () => {
    if (!reviewMode || reviewMode.currentIndex <= 0) return

    const prevIndex = reviewMode.currentIndex - 1
    const prevOrder = reviewMode.orders[prevIndex]

    if (dataSource === "mera") {
      const latestOrder = activeOrders.find((o) => o.itemId === prevOrder.itemId)
      setReviewMode((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          currentIndex: prevIndex,
          orders: latestOrder
            ? prev.orders.map((o, i) => (i === prevIndex ? latestOrder : o))
            : prev.orders,
        }
      })
      return
    }

    setReviewMode((prev) => prev ? { ...prev, currentIndex: prevIndex } : prev)

    console.log(`[v0] Moving to previous order ${prevOrder.itemId}, reloading data from sheet`)
    setIsJumpLoading(true)

    try {
      const reloadedOrder = await reloadOrderFromSheet(prevOrder.itemId)

      if (reloadedOrder) {
        const itemIdChanged = prevOrder.itemId !== reloadedOrder.itemId
        const changes = detectOrderChanges(prevOrder, reloadedOrder)

        setReviewMode((prev) => {
          if (!prev) return prev

          const updatedOrders = prev.orders.map((o) =>
            o.itemId === prevOrder.itemId
              ? { ...reloadedOrder, _changes: changes, _itemIdChanged: itemIdChanged ? prevOrder.itemId : undefined }
              : o,
          )

          return {
            ...prev,
            orders: updatedOrders,
          }
        })
      }
    } finally {
      setIsJumpLoading(false)
    }
  }

  const handleJumpToIndex = async (index: number) => {
    if (!reviewMode || index < 0 || index >= reviewMode.orders.length) return

    const targetOrder = reviewMode.orders[index]

    if (dataSource === "mera") {
      const latestOrder = activeOrders.find((o) => o.itemId === targetOrder.itemId)
      setReviewMode((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          currentIndex: index,
          orders: latestOrder
            ? prev.orders.map((o, i) => (i === index ? latestOrder : o))
            : prev.orders,
        }
      })
      return
    }

    setReviewMode((prev) => prev ? { ...prev, currentIndex: index } : prev)

    console.log(`[v0] Jumping to order ${targetOrder.itemId}, reloading data from sheet`)
    setIsJumpLoading(true)

    try {
      const reloadedOrder = await reloadOrderFromSheet(targetOrder.itemId)

      if (reloadedOrder) {
        const itemIdChanged = targetOrder.itemId !== reloadedOrder.itemId
        const changes = detectOrderChanges(targetOrder, reloadedOrder)

        setReviewMode((prev) => {
          if (!prev) return prev

          const updatedOrders = prev.orders.map((o) =>
            o.itemId === targetOrder.itemId
              ? { ...reloadedOrder, _changes: changes, _itemIdChanged: itemIdChanged ? targetOrder.itemId : undefined }
              : o,
          )

          return {
            ...prev,
            orders: updatedOrders,
          }
        })
      }
    } finally {
      setIsJumpLoading(false)
    }
  }

  const handleReviewAction = async (
    action: "confirm" | "need_repair" | "skip",
    repairType?: "design_error" | "customer_change",
    note?: string,
  ) => {
    if (!reviewMode) return

    const currentOrder = reviewMode.orders[reviewMode.currentIndex]

    if (dataSource === "mera") {
      // Mera: navigate ngay lập tức, PATCH chạy ngầm
      if (action === "confirm") {
        const targetStatus: Order["status"] = "CONFIRMED"
        if (reviewMode.currentIndex < reviewMode.orders.length - 1) {
          handleReviewNext()
        } else {
          setReviewMode(null)
        }
        handleMeraStatusUpdate(currentOrder as Order & { _mera?: MeraOrder }, targetStatus, note)
      } else if (action === "need_repair") {
        if (!repairType) return
        const targetStatus: Order["status"] = "NEED REPAIR"
        if (reviewMode.currentIndex < reviewMode.orders.length - 1) {
          handleReviewNext()
        } else {
          setReviewMode(null)
        }
        handleMeraStatusUpdate(currentOrder as Order & { _mera?: MeraOrder }, targetStatus, note, repairType)
      } else if (action === "skip") {
        if (reviewMode.currentIndex < reviewMode.orders.length - 1) {
          handleReviewNext()
        } else {
          setReviewMode(null)
        }
      }
      return
    }

    // Sheets: giữ nguyên behavior (await trước khi navigate)
    if (action === "confirm") {
      const targetStatus: Order["status"] = "CONFIRMED"
      const success = await updateOrderStatus(currentOrder, targetStatus, note)
      if (!success) return
    } else if (action === "need_repair") {
      if (!repairType) return
      const targetStatus: Order["status"] = "NEED REPAIR"
      const success = await updateOrderStatus(currentOrder, targetStatus, note, repairType)
      if (!success) return
    }

    if (reviewMode.currentIndex < reviewMode.orders.length - 1) {
      handleReviewNext()
    } else {
      setReviewMode(null)
    }
  }

  const handleStatusUpdate = async (
    newStatus: Order["status"],
    note?: string,
    changeType?: "design_error" | "customer_change",
  ) => {
    if (!reviewMode) return

    const currentOrder = reviewMode.orders[reviewMode.currentIndex]

    const success = dataSource === "mera"
      ? await handleMeraStatusUpdate(currentOrder as Order & { _mera?: MeraOrder }, newStatus, note, changeType)
      : await updateOrderStatus(currentOrder, newStatus, note, changeType)

    if (success) {
      setReviewMode((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          orders: prev.orders.map((order) =>
            order.itemId === currentOrder.itemId
              ? { ...order, status: newStatus, orderNote: note !== undefined ? note : order.orderNote }
              : order,
          ),
        }
      })
    }
  }

  const detectOrderChanges = (
    oldOrder: Order,
    newOrder: Order,
  ): Record<string, { old: string; new: string }> | null => {
    const changes: Record<string, { old: string; new: string }> = {}
    const fieldsToCheck: Array<keyof Order> = [
      "status",
      "orderNote",
      "designer",
      "designLink",
      "mockup",
      "customerImage",
      "personalization",
      "productType",
      "productName",
      "store",
      "productImage",
    ]

    let hasChanges = false

    fieldsToCheck.forEach((field) => {
      const oldValue = (oldOrder[field] || "").toString()
      const newValue = (newOrder[field] || "").toString()

      if (oldValue !== newValue) {
        changes[field] = {
          old: oldValue,
          new: newValue,
        }
        hasChanges = true
      }
    })

    return hasChanges ? changes : null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-6 space-y-6">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Order Review</h1>
              <p className="text-gray-600 mt-2">
                {dataSource === "sheets"
                  ? "Select a Google Sheet and review orders for quality assurance"
                  : "Review orders from Mera system"}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {/* Source toggle */}
              <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setDataSource("sheets")}
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${
                    dataSource === "sheets"
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Sheet className="h-4 w-4" />
                  Google Sheets
                </button>
                <button
                  onClick={() => setDataSource("mera")}
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${
                    dataSource === "mera"
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Database className="h-4 w-4" />
                  Mera
                </button>
              </div>

              {dataSource === "sheets" && (
                <SyncStatusIndicator
                  status={syncStatus}
                  pendingChanges={pendingChanges}
                  error={syncError}
                  onManualSync={triggerManualSync}
                />
              )}
            </div>
          </div>
        </div>

        {/* Sheets source */}
        {dataSource === "sheets" && (
          <SheetSelector
            sheets={sheets}
            selectedSheet={selectedSheet}
            loading={loading}
            onSheetSelect={handleSheetSelect}
            onRefresh={handleSheetsRefresh}
            lastSync={lastSync}
            syncStatus={syncStatus}
            pendingChanges={pendingChanges}
            syncError={syncError}
            onManualSync={triggerManualSync}
          />
        )}

        {/* Mera source — project selector */}
        {dataSource === "mera" && (
          <MeraProjectSelector
            projects={meraProjects}
            projectsLoading={meraProjectsLoading}
            selectedProjectId={meraProjectId}
            onProjectSelect={(projectId) => {
              setMeraProjectId(projectId)
              setMeraParams((p) => ({ ...p, page: 1 }))
            }}
            ordersLoading={meraLoading}
            error={meraError}
          />
        )}

        {/* Mera order list */}
        {dataSource === "mera" && (
          <OrderListHeader
            totalCount={meraTotal}
            filteredCount={filteredMeraOrders.length}
            filters={filters}
            onFiltersChange={applyFilters}
            onStartSequentialReview={handleStartSequentialReview}
            loadingTime={null}
            pagination={{
              page: meraPage,
              pageSize: merPageSize,
              totalPages: meraTotalPages,
            }}
            onPageSizeChange={(size) => setMeraParams((p) => ({ ...p, page_size: size, page: 1 }))}
            onPageChange={(page) => setMeraParams((p) => ({ ...p, page }))}
            filterOptions={meraFilterOptions}
            statusCounts={meraDerivedStatusCounts}
            designerCounts={meraDerivedFilteredCounts.designerCounts}
            productTypeCounts={meraDerivedFilteredCounts.productTypeCounts}
            storeCounts={meraDerivedFilteredCounts.storeCounts}
            onRefresh={handleMeraRefresh}
          />
        )}

        {/* Sheets order list */}
        {dataSource === "sheets" && selectedSheet && !isLoadingNewSheet && (
          <OrderListHeader
            totalCount={totalCount}
            filteredCount={filteredCount}
            filters={filters}
            onFiltersChange={applyFilters}
            onStartSequentialReview={handleStartSequentialReview}
            loadingTime={loadingTime}
            pagination={pagination}
            onPageSizeChange={changePageSize}
            onPageChange={changePage}
            filterOptions={filterOptions}
            statusCounts={statusCounts}
            designerCounts={filteredCounts.designerCounts}
            productTypeCounts={filteredCounts.productTypeCounts}
            storeCounts={filteredCounts.storeCounts}
            syncStatus={syncStatus}
            pendingChanges={pendingChanges}
            syncError={syncError}
            onManualSync={triggerManualSync}
            lastSync={lastSync}
            onRefresh={handleSheetsRefresh}
          />
        )}

        {dataSource === "sheets" && selectedSheet && isLoadingNewSheet && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
            <div className="flex items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin mr-3 text-blue-600" />
              <span className="text-lg text-gray-600">Loading orders from selected sheet...</span>
            </div>
          </div>
        )}

        {reviewMode && (
          <OrderReviewModal
            isOpen={reviewMode.isActive}
            order={reviewMode.orders[reviewMode.currentIndex]}
            currentIndex={reviewMode.currentIndex}
            totalCount={reviewMode.orders.length}
            selectedSheet={sheets.find((s) => s.id === selectedSheet)}
            onClose={handleReviewClose}
            onNext={handleReviewNext}
            onPrevious={handleReviewPrevious}
            onJumpToIndex={handleJumpToIndex}
            onAction={handleReviewAction}
            availableStatuses={filterOptions.statuses}
            onStatusUpdate={handleStatusUpdate}
            syncStatus={syncStatus}
            pendingChanges={pendingChanges}
            syncError={syncError}
            onManualSync={triggerManualSync}
            reviewMode={reviewMode}
            isJumpLoading={isJumpLoading} // Pass loading state to modal
          />
        )}
      </div>
    </div>
  )
}
