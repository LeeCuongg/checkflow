"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AlertTriangle,
  Users,
  CalendarIcon,
  RefreshCw,
  Package,
  User,
  Clock,
  Mail,
  Copy,
  Repeat,
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react"
import { useApi } from "@/hooks/use-api"
import { useMeraProjects } from "@/hooks/use-mera-projects"
import { MultiSelect } from "@/components/ui/multi-select"
import { ALL_STATUSES } from "@/constants/statuses"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { format } from "date-fns"
import { format as timeAgo } from "timeago.js"
import type { DateRange } from "react-day-picker"
import Link from "next/link"

type TimeRange = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "all_time" | "custom"

export default function NeedRepairPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("this_week")
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null)
  // Multi-select các sheet cụ thể (rỗng = tất cả)
  const [selectedSheetIds, setSelectedSheetIds] = useState<string[]>([])
  // Multi-select trạng thái HIỆN TẠI của đơn (rỗng = tất cả status)
  const [selectedCurrentStatuses, setSelectedCurrentStatuses] = useState<string[]>([])
  // Multi-select Mera projects (rỗng = tất cả)
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([])
  // Bật/tắt nguồn — mặc định gộp cả 2
  const [includeSheet, setIncludeSheet] = useState(true)
  const [includeMera, setIncludeMera] = useState(true)

  // Lấy list sheet để build options cho MultiSelect
  const { data: sheetsResp } = useApi("/sheets")
  const sheetOptions = useMemo(() => {
    const arr = (sheetsResp as any)?.data ?? []
    return arr.map((s: any) => ({
      value: s.google_sheet_id,
      label: s.name || s.google_sheet_id,
    }))
  }, [sheetsResp])
  const statusOptions = useMemo(
    () => ALL_STATUSES.map((s) => ({ value: s, label: s })),
    [],
  )
  const { projects: meraProjects } = useMeraProjects()
  const projectOptions = useMemo(
    () => meraProjects.map((p) => ({ value: p.id, label: p.name })),
    [meraProjects],
  )

  // Filter + sort cho bảng By Designer
  const [designerSearch, setDesignerSearch] = useState("")
  type SortKey =
    | "designer"
    | "total_rounds"
    | "distinct_orders"
    | "nr_times"
    | "rate_design_error"
    | "rate_customer_change"
    | "design_error"
    | "customer_change"
    | "confirmed_after_repair"
    | "repaired_for_others"
  const [sortKey, setSortKey] = useState<SortKey>("total_rounds")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "designer" ? "asc" : "desc")
    }
  }

  // Filter cho bảng Detailed Repair Records
  const [detailSearch, setDetailSearch] = useState("")
  const [detailDesigner, setDetailDesigner] = useState<string>("__all__")
  const [detailProduct, setDetailProduct] = useState<string>("__all__")

  const copyItemId = async (itemId: string) => {
    try {
      await navigator.clipboard.writeText(itemId)
      setCopiedItemId(itemId)
      setTimeout(() => setCopiedItemId(null), 2000)
    } catch (err) {
      console.error("Failed to copy item ID:", err)
    }
  }

  const getApiUrl = () => {
    const params = new URLSearchParams({ timeRange })
    if (timeRange === "custom" && dateRange?.from && dateRange?.to) {
      // `to` từ Calendar là midnight ĐẦU ngày của ngày user chọn.
      // Cộng 1 ngày để khoảng [from, to+1) bao gồm trọn ngày cuối.
      const endExclusive = new Date(dateRange.to.getTime() + 24 * 60 * 60 * 1000)
      params.set("startDate", dateRange.from.toISOString())
      params.set("endDate", endExclusive.toISOString())
    }
    if (selectedSheetIds.length > 0) params.set("sheetIds", selectedSheetIds.join(","))
    if (selectedCurrentStatuses.length > 0) params.set("currentStatuses", selectedCurrentStatuses.join(","))
    if (selectedProjectIds.length > 0) params.set("projectIds", selectedProjectIds.join(","))
    if (!includeSheet) params.set("includeSheet", "false")
    if (!includeMera) params.set("includeMera", "false")
    return `/need-repair/stats?${params.toString()}`
  }

  const { data: stats, loading, error, refetch } = useApi<any>(getApiUrl())

  const handleTimeRangeChange = (value: TimeRange) => {
    setTimeRange(value)
    if (value !== "custom") {
      setDateRange(undefined)
    }
  }

  const handleDateRangeSelect = (range: DateRange | undefined) => {
    setDateRange(range)
    if (range?.from && range?.to) {
      setTimeRange("custom")
      setIsCalendarOpen(false)
    }
  }

  const getTimeRangeLabel = () => {
    switch (timeRange) {
      case "today":
        return "Today"
      case "yesterday":
        return "Yesterday"
      case "this_week":
        return "This Week"
      case "last_week":
        return "Last Week"
      case "this_month":
        return "This Month"
      case "last_month":
        return "Last Month"
      case "all_time":
        return "All Time"
      case "custom":
        if (dateRange?.from && dateRange?.to) {
          return `${format(dateRange.from, "MMM d")} - ${format(dateRange.to, "MMM d")}`
        }
        return "Custom Range"
      default:
        return "This Week"
    }
  }

  const summary = stats?.data?.summary || {}
  const designerStats = stats?.data?.designerStats || []
  const productTypeStats = stats?.data?.productTypeStats || []
  const detailedRecords = stats?.data?.detailedRecords || []

  const filteredDesignerStats = useMemo(() => {
    const q = designerSearch.trim().toLowerCase()
    const rows = q
      ? designerStats.filter((d: any) => (d.designer || "").toLowerCase().includes(q))
      : [...designerStats]
    rows.sort((a: any, b: any) => {
      const va = a[sortKey]
      const vb = b[sortKey]
      // null/undefined sort xuống cuối
      const an = va === null || va === undefined
      const bn = vb === null || vb === undefined
      if (an && bn) return 0
      if (an) return 1
      if (bn) return -1
      if (typeof va === "string" && typeof vb === "string") {
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va)
      }
      return sortDir === "asc" ? Number(va) - Number(vb) : Number(vb) - Number(va)
    })
    return rows
  }, [designerStats, designerSearch, sortKey, sortDir])

  const detailDesignerOptions = useMemo(() => {
    const set = new Set<string>()
    detailedRecords.forEach((r: any) => r.designer && set.add(r.designer))
    return Array.from(set).sort()
  }, [detailedRecords])

  const detailProductOptions = useMemo(() => {
    const set = new Set<string>()
    detailedRecords.forEach((r: any) => r.product_type && set.add(r.product_type))
    return Array.from(set).sort()
  }, [detailedRecords])

  const filteredDetailedRecords = useMemo(() => {
    const q = detailSearch.trim().toLowerCase()
    return detailedRecords.filter((r: any) => {
      if (detailDesigner !== "__all__" && r.designer !== detailDesigner) return false
      if (detailProduct !== "__all__" && r.product_type !== detailProduct) return false
      if (q) {
        const itemId = String(r.item_id || "").toLowerCase()
        const note = String(r.order_note || "").toLowerCase()
        if (!itemId.includes(q) && !note.includes(q)) return false
      }
      return true
    })
  }, [detailedRecords, detailSearch, detailDesigner, detailProduct])

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="h-3 w-3 ml-1 inline text-gray-400" />
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 ml-1 inline text-pink-600" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1 inline text-pink-600" />
    )
  }

  if (loading) {
    return (
      <div className="flex-1 space-y-6 p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 space-y-6 p-6">
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-red-700">Failed to load repair statistics: {error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Need Repair Statistics</h1>
          <p className="text-gray-600 mt-1">Track repair requests by designer and time period</p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
            {getTimeRangeLabel()}
          </Badge>
          <Button onClick={() => refetch()} className="bg-pink-600 hover:bg-pink-700 text-white shadow-md">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <Card className="shadow-md border-0">
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
          <CardDescription>
            Time range áp dụng cho thời điểm reviewer chấm bài — CONFIRMED hoặc NEED REPAIR
            (order_history.created_at). Lỗi tính cho designer đang giữ đơn lúc bị trả, không phải designer đầu tiên.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-500 font-medium">Time Period</span>
              <Select value={timeRange} onValueChange={handleTimeRangeChange}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="this_week">This Week</SelectItem>
                  <SelectItem value="last_week">Last Week</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                  <SelectItem value="all_time">All Time</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-500 font-medium">Sheet</span>
              <MultiSelect
                options={sheetOptions}
                value={selectedSheetIds}
                onChange={setSelectedSheetIds}
                placeholder="All sheets"
                className="w-56"
                emptyText="No sheets"
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-500 font-medium">Mera projects</span>
              <MultiSelect
                options={projectOptions}
                value={selectedProjectIds}
                onChange={setSelectedProjectIds}
                placeholder="All projects"
                className="w-56"
                emptyText="No projects"
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-500 font-medium">Trạng thái hiện tại</span>
              <MultiSelect
                options={statusOptions}
                value={selectedCurrentStatuses}
                onChange={setSelectedCurrentStatuses}
                placeholder="All statuses"
                className="w-56"
                emptyText="No statuses"
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-500 font-medium">Source</span>
              <div className="flex gap-1 h-10 items-center">
                <Button
                  type="button"
                  size="sm"
                  variant={includeSheet ? "default" : "outline"}
                  onClick={() => setIncludeSheet((v) => !v)}
                  className={includeSheet ? "bg-pink-600 hover:bg-pink-700 text-white" : "bg-transparent"}
                >
                  Sheet
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={includeMera ? "default" : "outline"}
                  onClick={() => setIncludeMera((v) => !v)}
                  className={includeMera ? "bg-pink-600 hover:bg-pink-700 text-white" : "bg-transparent"}
                >
                  Mera
                </Button>
              </div>
            </div>

            {timeRange === "custom" && (
              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-64 justify-start text-left font-normal bg-transparent">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}
                        </>
                      ) : (
                        format(dateRange.from, "LLL dd, y")
                      )
                    ) : (
                      <span>Pick a date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={handleDateRangeSelect}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card className="shadow-md border-0 bg-gradient-to-br from-red-50 to-red-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">Đơn cần sửa</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{summary.totalOrders ?? summary.totalRepairs ?? 0}</div>
            <p className="text-xs text-gray-600 mt-1">Đơn distinct bị trả về trong kỳ</p>
          </CardContent>
        </Card>

        <Card className="shadow-md border-0 bg-gradient-to-br from-purple-50 to-purple-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">Lượt bị trả</CardTitle>
            <Repeat className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{summary.totalTimes ?? summary.totalRepairs ?? 0}</div>
            <p className="text-xs text-gray-600 mt-1">Tổng số lần mark NEED REPAIR</p>
          </CardContent>
        </Card>

        <Card className="shadow-md border-0 bg-gradient-to-br from-orange-50 to-orange-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">Đơn lỗi design</CardTitle>
            <Package className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{summary.designErrorOrders || 0}</div>
            <p className="text-xs text-gray-600 mt-1">{summary.designErrors || 0} lượt · đơn distinct</p>
          </CardContent>
        </Card>

        <Card className="shadow-md border-0 bg-gradient-to-br from-blue-50 to-blue-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">Đơn customer change</CardTitle>
            <User className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{summary.customerChangeOrders || 0}</div>
            <p className="text-xs text-gray-600 mt-1">{summary.customerChanges || 0} lượt · đơn distinct</p>
          </CardContent>
        </Card>

        <Card className="shadow-md border-0 bg-gradient-to-br from-teal-50 to-teal-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">Chốt sau sửa</CardTitle>
            <Repeat className="h-4 w-4 text-teal-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{summary.confirmedAfterRepair || 0}</div>
            <p className="text-xs text-gray-600 mt-1">Đơn từng bị trả, được CONFIRMED trong kỳ</p>
          </CardContent>
        </Card>

        <Card className="shadow-md border-0 bg-gradient-to-br from-green-50 to-green-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">Designer bị trả</CardTitle>
            <Users className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{summary.uniqueDesigners || 0}</div>
            <p className="text-xs text-gray-600 mt-1">{summary.gradedDesigners || 0} designer có lượt chấm</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="designers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="designers">By Designer</TabsTrigger>
          <TabsTrigger value="products">By Product</TabsTrigger>
        </TabsList>

        <TabsContent value="designers" className="space-y-4">
          <Card className="shadow-md border-0">
            <CardHeader>
              <CardTitle className="text-gray-900 flex items-center">
                <Users className="h-5 w-5 text-pink-600 mr-2" />
                Repair Statistics by Designer
              </CardTitle>
              <CardDescription>
                Đơn vị đo là lượt chấm: mỗi lần reviewer đánh giá bài của designer đang giữ đơn. Đơn chuyển tay thì
                lỗi thuộc người gây ra, lượt đạt và cột &quot;Sửa hộ&quot; thuộc người sửa.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={designerSearch}
                  onChange={(e) => setDesignerSearch(e.target.value)}
                  placeholder="Search designer..."
                  className="pl-9"
                />
              </div>
              {designerStats.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead onClick={() => toggleSort("designer")} className="cursor-pointer select-none">
                        Designer <SortIcon k="designer" />
                      </TableHead>
                      <TableHead
                        onClick={() => toggleSort("total_rounds")}
                        className="text-center cursor-pointer select-none"
                        title="Số lần reviewer chấm bài của designer (CONFIRMED + NEED REPAIR) — mẫu số của các tỉ lệ"
                      >
                        Lượt chấm <SortIcon k="total_rounds" />
                      </TableHead>
                      <TableHead
                        onClick={() => toggleSort("distinct_orders")}
                        className="text-center cursor-pointer select-none"
                        title="Số đơn distinct designer có mặt trong kỳ"
                      >
                        Đơn <SortIcon k="distinct_orders" />
                      </TableHead>
                      <TableHead
                        onClick={() => toggleSort("rate_design_error")}
                        className="text-center cursor-pointer select-none"
                        title="Lượt bị trả do lỗi design / tổng lượt chấm"
                      >
                        Tỉ lệ lỗi design <SortIcon k="rate_design_error" />
                      </TableHead>
                      <TableHead
                        onClick={() => toggleSort("rate_customer_change")}
                        className="text-center cursor-pointer select-none"
                        title="Lượt bị trả do khách đổi ý / tổng lượt chấm"
                      >
                        Tỉ lệ customer change <SortIcon k="rate_customer_change" />
                      </TableHead>
                      <TableHead
                        onClick={() => toggleSort("design_error")}
                        className="text-center cursor-pointer select-none"
                        title="Số lượt bị trả do lỗi design"
                      >
                        Lỗi design <SortIcon k="design_error" />
                      </TableHead>
                      <TableHead
                        onClick={() => toggleSort("customer_change")}
                        className="text-center cursor-pointer select-none"
                        title="Số lượt bị trả do khách đổi ý"
                      >
                        Customer change <SortIcon k="customer_change" />
                      </TableHead>
                      <TableHead
                        onClick={() => toggleSort("nr_times")}
                        className="text-center cursor-pointer select-none"
                        title="Tổng số lượt bị trả về (cả 2 loại). Trong ngoặc là số đơn distinct."
                      >
                        Lượt bị trả <SortIcon k="nr_times" />
                      </TableHead>
                      <TableHead
                        onClick={() => toggleSort("confirmed_after_repair")}
                        className="text-center cursor-pointer select-none"
                        title="Đơn từng bị trả về và được designer này chốt trong kỳ"
                      >
                        Chốt sau sửa <SortIcon k="confirmed_after_repair" />
                      </TableHead>
                      <TableHead
                        onClick={() => toggleSort("repaired_for_others")}
                        className="text-center cursor-pointer select-none"
                        title="Số lần đứng ra sửa đơn do designer KHÁC gây lỗi"
                      >
                        Sửa hộ <SortIcon k="repaired_for_others" />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDesignerStats.map((designer: any, index: number) => {
                      const rounds = designer.total_rounds ?? 0
                      const distinctOrders = designer.distinct_orders ?? 0
                      const nrTimes = designer.nr_times ?? 0
                      const ordersNr = designer.orders_need_repair ?? 0
                      const rateDE: number | null =
                        typeof designer.rate_design_error === "number" ? designer.rate_design_error : null
                      const rateCC: number | null =
                        typeof designer.rate_customer_change === "number" ? designer.rate_customer_change : null
                      const fmtRate = (r: number | null) => (r === null ? "N/A" : r.toFixed(1) + "%")
                      const colorRate = (r: number | null, hi: number, mid: number) =>
                        r === null
                          ? "text-gray-400"
                          : r > hi
                            ? "text-red-600"
                            : r > mid
                              ? "text-orange-600"
                              : "text-green-600"
                      return (
                        <TableRow key={index}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-gray-400" />
                              <Link
                                href={`/need-repair/${encodeURIComponent(designer.designer)}`}
                                className="text-pink-600 hover:text-pink-700 hover:underline font-medium"
                              >
                                {designer.designer}
                              </Link>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">
                              {rounds}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="bg-gray-50">
                              {distinctOrders}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`font-medium ${colorRate(rateDE, 25, 10)}`}>{fmtRate(rateDE)}</span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`font-medium ${colorRate(rateCC, 25, 10)}`}>{fmtRate(rateCC)}</span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                              {designer.design_error}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                              {designer.customer_change}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                              {nrTimes}
                            </Badge>
                            <span className="text-xs text-gray-500 ml-1">({ordersNr} đơn)</span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              {designer.confirmed_after_repair ?? 0}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                              {designer.repaired_for_others ?? 0}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No repair data found for the selected time period</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          <Card className="shadow-md border-0">
            <CardHeader>
              <CardTitle className="text-gray-900 flex items-center">
                <Package className="h-5 w-5 text-pink-600 mr-2" />
                Repair Statistics by Product Type
              </CardTitle>
              <CardDescription>Breakdown of repair requests by product category</CardDescription>
            </CardHeader>
            <CardContent>
              {productTypeStats.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product Type</TableHead>
                      <TableHead className="text-center">Repair Count</TableHead>
                      <TableHead className="text-center">Percentage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productTypeStats.map((product: any, index: number) => {
                      const percentage =
                        summary.totalRepairs > 0 ? ((product.count / summary.totalRepairs) * 100).toFixed(1) : "0.0"
                      return (
                        <TableRow key={index}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Package className="h-4 w-4 text-gray-400" />
                              {product.product}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="bg-pink-50 text-pink-700 border-pink-200">
                              {product.count}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="font-medium text-gray-900">{percentage}%</span>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Package className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No product data found for the selected time period</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="shadow-md border-0">
        <CardHeader>
          <CardTitle className="text-gray-900 flex items-center">
            <AlertTriangle className="h-5 w-5 text-pink-600 mr-2" />
            Detailed Repair Records
          </CardTitle>
          <CardDescription>Individual repair items with designer and error details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={detailSearch}
                onChange={(e) => setDetailSearch(e.target.value)}
                placeholder="Search Item ID hoặc Order Note..."
                className="pl-9"
              />
            </div>
            <Select value={detailDesigner} onValueChange={setDetailDesigner}>
              <SelectTrigger>
                <SelectValue placeholder="All designers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All designers</SelectItem>
                {detailDesignerOptions.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={detailProduct} onValueChange={setDetailProduct}>
              <SelectTrigger>
                <SelectValue placeholder="All products" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All products</SelectItem>
                {detailProductOptions.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-gray-500">
            Hiển thị {filteredDetailedRecords.length} / {detailedRecords.length} records
          </div>
          {filteredDetailedRecords.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item ID</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Designer</TableHead>
                  <TableHead>Checker</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Issue Description</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDetailedRecords.map((repair: any) => (
                  <TableRow key={repair.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-pink-50 text-pink-700 border-pink-200">
                          {repair.item_id}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyItemId(repair.item_id)}
                          className="h-6 w-6 p-0 hover:bg-pink-50"
                          title="Copy Item ID"
                        >
                          <Copy
                            className={`h-3 w-3 ${copiedItemId === repair.item_id ? "text-green-600" : "text-gray-400"}`}
                          />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          repair.source === "mera"
                            ? "bg-purple-50 text-purple-700 border-purple-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }
                      >
                        {repair.source === "mera" ? "Mera" : "Sheet"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-400" />
                        <Link
                          href={`/need-repair/${encodeURIComponent(repair.designer)}`}
                          className="text-pink-600 hover:text-pink-700 hover:underline font-medium"
                        >
                          {repair.designer}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-gray-400" />
                        <span className="text-sm">{repair.users?.email || "N/A"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-gray-400" />
                        {repair.product_type}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-md">
                        <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                          {repair.order_note || "No description provided"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Clock className="h-3 w-3" />
                        {timeAgo(repair.created_at)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No repair records found for the selected time period</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
