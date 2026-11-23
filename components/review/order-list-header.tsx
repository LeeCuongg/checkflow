"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Filter, X, Play, Clock, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react"
import { SyncStatusIndicator } from "@/components/sync-status-indicator"
import type { OrderFilters } from "@/types/order"

interface OrderListHeaderProps {
  totalCount: number
  filteredCount: number
  filters: OrderFilters
  onFiltersChange: (filters: OrderFilters) => void
  onStartSequentialReview: () => void
  loadingTime: number | null
  pagination: {
    page: number
    pageSize: number
    totalPages: number
  }
  onPageSizeChange: (pageSize: number) => void
  onPageChange: (page: number) => void
  filterOptions: {
    statuses: string[]
    designers: string[]
    productTypes: string[]
    stores: string[]
  }
  statusCounts?: Record<string, number>
  designerCounts?: Record<string, number>
  productTypeCounts?: Record<string, number>
  storeCounts?: Record<string, number>
  /**
   * false = the designer / product type / store options are complete lists with no counts
   * (Mera: they cover every page, and a count is only known for the loaded page).
   */
  showFacetCounts?: boolean
  searchPlaceholder?: string
  syncStatus?: "idle" | "syncing" | "success" | "error"
  pendingChanges?: number
  syncError?: string | null
  onManualSync?: () => void
  lastSync?: string
  onRefresh?: () => void
}

export function OrderListHeader({
  totalCount,
  filteredCount,
  filters,
  onFiltersChange,
  onStartSequentialReview,
  loadingTime,
  pagination,
  onPageSizeChange,
  onPageChange,
  filterOptions,
  statusCounts = {},
  designerCounts = {},
  productTypeCounts = {},
  storeCounts = {},
  showFacetCounts = true,
  searchPlaceholder = "Search orders by ID, note, personalization, product, designer, or store...",
  syncStatus = "idle",
  pendingChanges = 0,
  syncError,
  onManualSync,
  lastSync,
  onRefresh,
}: OrderListHeaderProps) {
  const [searchQuery, setSearchQuery] = useState(filters.searchQuery || "")
  const [showFilters, setShowFilters] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    onFiltersChange({ ...filters, searchQuery: value })
  }

  const clearFilters = () => {
    setSearchQuery("")
    onFiltersChange({})
  }

  const hasActiveFilters = () => {
    return (
      (filters.status && filters.status.length > 0) ||
      (filters.designer && filters.designer.length > 0) ||
      (filters.productType && filters.productType.length > 0) ||
      (filters.store && filters.store.length > 0) ||
      filters.searchQuery ||
      filters.dateRange?.from ||
      filters.dateRange?.to
    )
  }

  const getActiveFilterCount = () => {
    let count = 0
    if (filters.status && filters.status.length > 0) count++
    if (filters.designer && filters.designer.length > 0) count++
    if (filters.productType && filters.productType.length > 0) count++
    if (filters.store && filters.store.length > 0) count++
    if (filters.searchQuery) count++
    if (filters.dateRange?.from || filters.dateRange?.to) count++
    return count
  }

  const formatLoadingTime = (time: number) => {
    if (time < 1000) return `${time}ms`
    return `${(time / 1000).toFixed(1)}s`
  }

  const getPageInfo = () => {
    if (pagination.pageSize === -1) {
      return `Showing all ${filteredCount.toLocaleString()} orders`
    }

    const start = (pagination.page - 1) * pagination.pageSize + 1
    const end = Math.min(pagination.page * pagination.pageSize, filteredCount)
    return `Showing ${start.toLocaleString()}-${end.toLocaleString()} of ${filteredCount.toLocaleString()} orders`
  }

  const formatLastSync = (timestamp?: string) => {
    if (!timestamp) return "Never"
    try {
      const date = new Date(timestamp)
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffMins = Math.floor(diffMs / (1000 * 60))

      if (diffMins < 1) return "Just now"
      if (diffMins < 60) return `${diffMins}m ago`
      if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
      return date.toLocaleDateString()
    } catch {
      return "Unknown"
    }
  }

  const handleRefresh = async () => {
    if (!onRefresh) return
    setIsRefreshing(true)
    await onRefresh()
    setIsRefreshing(false)
  }

  return (
    <Card className="border-gray-200 shadow-sm">
      <div className="p-6">
        {/* Header Row */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold text-gray-900">Orders</h2>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <span>{getPageInfo()}</span>
              {totalCount !== filteredCount && (
                <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
                  {filteredCount} of {totalCount.toLocaleString()} total
                </Badge>
              )}
              {loadingTime && (
                <div className="flex items-center gap-1 text-green-600">
                  <Clock className="w-4 h-4" />
                  <span>Loaded in {formatLoadingTime(loadingTime)}</span>
                </div>
              )}
              {hasActiveFilters() && (
                <Badge variant="secondary" className="bg-orange-50 text-orange-700 border-orange-200">
                  {getActiveFilterCount()} filter{getActiveFilterCount() !== 1 ? "s" : ""}
                </Badge>
              )}
              {lastSync && <span className="text-gray-500">Last sync: {formatLastSync(lastSync)}</span>}
              <SyncStatusIndicator
                status={syncStatus}
                pendingChanges={pendingChanges}
                error={syncError}
                onManualSync={onManualSync}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {onRefresh && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-2 bg-transparent border-gray-300"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            )}
            {filteredCount > 0 && (
              <Button onClick={onStartSequentialReview} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
                <Play className="h-4 w-4 mr-2" />
                Start Sequential Review
              </Button>
            )}
          </div>
        </div>

        {/* Search and Controls Row */}
        <div className="flex items-center gap-4 mb-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          {/* Page Size Selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 whitespace-nowrap">Show:</span>
            <Select
              value={pagination.pageSize.toString()}
              onValueChange={(value) => onPageSizeChange(Number.parseInt(value))}
            >
              <SelectTrigger className="w-20 border-gray-300">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="-1">All</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Filter Toggle */}
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="border-gray-300 hover:bg-gray-50"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
            {hasActiveFilters() && (
              <Badge variant="secondary" className="ml-2 bg-orange-100 text-orange-700">
                {getActiveFilterCount()}
              </Badge>
            )}
          </Button>

          {/* Clear Filters */}
          {hasActiveFilters() && (
            <Button
              variant="outline"
              onClick={clearFilters}
              className="border-gray-300 hover:bg-gray-50 text-gray-600 bg-transparent"
            >
              <X className="h-4 w-4 mr-2" />
              Clear
            </Button>
          )}
        </div>

        {/* Pagination Controls */}
        {pagination.pageSize !== -1 && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-600">
              Page {pagination.page} of {pagination.totalPages}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="border-gray-300"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>

              {/* Page numbers */}
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                  let pageNum: number
                  if (pagination.totalPages <= 5) {
                    pageNum = i + 1
                  } else if (pagination.page <= 3) {
                    pageNum = i + 1
                  } else if (pagination.page >= pagination.totalPages - 2) {
                    pageNum = pagination.totalPages - 4 + i
                  } else {
                    pageNum = pagination.page - 2 + i
                  }

                  return (
                    <Button
                      key={pageNum}
                      variant={pageNum === pagination.page ? "default" : "outline"}
                      size="sm"
                      onClick={() => onPageChange(pageNum)}
                      className={
                        pageNum === pagination.page
                          ? "bg-blue-600 hover:bg-blue-700"
                          : "border-gray-300 hover:bg-gray-50"
                      }
                    >
                      {pageNum}
                    </Button>
                  )
                })}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="border-gray-300"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Active Filters Display */}
        {hasActiveFilters() && (
          <div className="flex flex-wrap gap-2 mb-4">
            {filters.status?.map((status) => (
              <Badge key={status} variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
                Status: {status}
              </Badge>
            ))}

            {filters.designer?.map((designer) => (
              <Badge key={designer} variant="secondary" className="bg-green-50 text-green-700 border-green-200">
                Designer: {designer}
              </Badge>
            ))}

            {filters.productType?.map((type) => (
              <Badge key={type} variant="secondary" className="bg-purple-50 text-purple-700 border-purple-200">
                Type: {type}
              </Badge>
            ))}

            {filters.store?.map((store) => (
              <Badge key={store} variant="secondary" className="bg-orange-50 text-orange-700 border-orange-200">
                Store: {store}
              </Badge>
            ))}

            {filters.searchQuery && (
              <Badge variant="secondary" className="bg-gray-50 text-gray-700 border-gray-200">
                Search: "{filters.searchQuery}"
              </Badge>
            )}
          </div>
        )}

        {/* Extended Filters Panel */}
        {showFilters && (
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Status Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Status</label>
                <div className="space-y-2">
                  {filterOptions.statuses
                    .filter((status) => (statusCounts[status] || 0) > 0)
                    .sort((a, b) => a.localeCompare(b))
                    .map((status) => {
                      const getStatusColor = (status: string) => {
                        switch (status.toUpperCase()) {
                          case "NEW":
                            return "bg-green-100 text-green-700 border-green-200"
                          case "DESIGNED":
                            return "bg-blue-100 text-blue-800 border-blue-200"
                          case "NEED_REPAIR":
                          case "NEED REPAIR":
                            return "bg-red-100 text-red-800 border-red-200"
                          case "REPAIRED":
                            return "bg-purple-100 text-purple-800 border-purple-200"
                          case "PENDING":
                            return "bg-yellow-100 text-yellow-800 border-yellow-200"
                          case "COMPLETED":
                            return "bg-emerald-100 text-emerald-800 border-emerald-200"
                          case "CANCELLED":
                            return "bg-red-100 text-red-800 border-red-200"
                          default:
                            return "bg-gray-100 text-gray-800 border-gray-200"
                        }
                      }

                      return (
                        <label
                          key={status}
                          className="flex items-center justify-between hover:bg-white rounded px-2 py-1 transition-colors"
                        >
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              checked={filters.status?.includes(status) || false}
                              onChange={(e) => {
                                const currentStatuses = filters.status || []
                                const newStatuses = e.target.checked
                                  ? [...currentStatuses, status]
                                  : currentStatuses.filter((s) => s !== status)
                                onFiltersChange({
                                  ...filters,
                                  status: newStatuses.length > 0 ? newStatuses : undefined,
                                })
                              }}
                              className="mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">{status}</span>
                          </div>
                          <Badge className={`text-xs px-2 py-1 ${getStatusColor(status)}`}>
                            {statusCounts[status]}
                          </Badge>
                        </label>
                      )
                    })}
                </div>
              </div>

              {/* Designer Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Designer</label>
                <div className="space-y-2 max-h-[28rem] overflow-y-auto">
                  {filterOptions.designers
                    .filter((designer) => !showFacetCounts || (designerCounts[designer] || 0) > 0)
                    .sort((a, b) => {
                      if (a === "[Blank]") return -1
                      if (b === "[Blank]") return 1
                      return a.localeCompare(b)
                    })
                    .map((designer) => (
                      <label
                        key={designer}
                        className="flex items-center justify-between hover:bg-white rounded px-2 py-1 transition-colors"
                      >
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            checked={filters.designer?.includes(designer) || false}
                            onChange={(e) => {
                              const currentDesigners = filters.designer || []
                              const newDesigners = e.target.checked
                                ? [...currentDesigners, designer]
                                : currentDesigners.filter((d) => d !== designer)
                              onFiltersChange({
                                ...filters,
                                designer: newDesigners.length > 0 ? newDesigners : undefined,
                              })
                            }}
                            className="mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">
                            {designer === "[Blank]" ? "(No Designer)" : designer}
                          </span>
                        </div>
                        {showFacetCounts && (
                          <Badge className="text-xs px-2 py-1 bg-green-100 text-green-700 border-green-200">
                            {designerCounts[designer]}
                          </Badge>
                        )}
                      </label>
                    ))}
                </div>
              </div>

              {/* Product Type Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Product Type</label>
                <div className="space-y-2 max-h-[28rem] overflow-y-auto">
                  {filterOptions.productTypes
                    .filter((type) => !showFacetCounts || (productTypeCounts[type] || 0) > 0)
                    .sort((a, b) => a.localeCompare(b))
                    .map((type) => (
                      <label
                        key={type}
                        className="flex items-center justify-between hover:bg-white rounded px-2 py-1 transition-colors"
                      >
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            checked={filters.productType?.includes(type) || false}
                            onChange={(e) => {
                              const currentTypes = filters.productType || []
                              const newTypes = e.target.checked
                                ? [...currentTypes, type]
                                : currentTypes.filter((t) => t !== type)
                              onFiltersChange({ ...filters, productType: newTypes.length > 0 ? newTypes : undefined })
                            }}
                            className="mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">{type}</span>
                        </div>
                        {showFacetCounts && (
                          <Badge className="text-xs px-2 py-1 bg-purple-100 text-purple-700 border-purple-200">
                            {productTypeCounts[type]}
                          </Badge>
                        )}
                      </label>
                    ))}
                </div>
              </div>

              {/* Store Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Store</label>
                <div className="space-y-2 max-h-[28rem] overflow-y-auto">
                  {filterOptions.stores
                    .filter((store) => !showFacetCounts || (storeCounts[store] || 0) > 0)
                    .sort((a, b) => a.localeCompare(b))
                    .map((store) => (
                      <label
                        key={store}
                        className="flex items-center justify-between hover:bg-white rounded px-2 py-1 transition-colors"
                      >
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            checked={filters.store?.includes(store) || false}
                            onChange={(e) => {
                              const currentStores = filters.store || []
                              const newStores = e.target.checked
                                ? [...currentStores, store]
                                : currentStores.filter((s) => s !== store)
                              onFiltersChange({ ...filters, store: newStores.length > 0 ? newStores : undefined })
                            }}
                            className="mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">{store}</span>
                        </div>
                        {showFacetCounts && (
                          <Badge className="text-xs px-2 py-1 bg-orange-100 text-orange-700 border-orange-200">
                            {storeCounts[store]}
                          </Badge>
                        )}
                      </label>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
