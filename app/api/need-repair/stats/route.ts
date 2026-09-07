import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase"
import { logServerError, logServerInfo } from "@/lib/server-sentry"
import { meraClient } from "@/lib/mera-client"
import type { MeraOrder } from "@/types/mera-order"
import { getDateRange, vnDateKey } from "@/lib/time-range"

const MERA_SHEET_ID = "__mera__"
const MERA_PAGE_SIZE = 500
const MERA_MAX_PAGES = 20

async function fetchAllMeraOrders(
  actor: { id: string; email: string },
  params: Parameters<typeof meraClient.listOrders>[1],
): Promise<MeraOrder[]> {
  const all: MeraOrder[] = []
  for (let page = 1; page <= MERA_MAX_PAGES; page++) {
    const res = await meraClient.listOrders(actor, {
      ...params,
      page,
      page_size: MERA_PAGE_SIZE,
      include_items: true,
    })
    const orders = res.orders ?? []
    all.push(...orders)
    // Dừng khi: hết trang (theo total_pages nếu API trả về) HOẶC page hiện tại chưa đầy.
    // Tránh silent-miss nếu total_pages = null/0/undefined.
    if (res.total_pages != null && page >= res.total_pages) break
    if (orders.length < MERA_PAGE_SIZE) break
  }
  return all
}

export async function GET(request: NextRequest) {
  try {
    const appUser = await authenticateRequest(request)
    const supabase = createServerClient()
    const { searchParams } = new URL(request.url)

    const timeRange = searchParams.get("timeRange") || "all_time"
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    // sheetIds: CSV list of google_sheet_id để lọc theo các sheet cụ thể. Rỗng = tất cả.
    const sheetIdsParam = searchParams.get("sheetIds") || ""
    const sheetIds = sheetIdsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    // currentStatuses: CSV list of status. Khi có giá trị → chỉ giữ đơn HIỆN ĐANG ở status đó.
    // Rỗng = không lọc theo trạng thái hiện tại.
    const currentStatusesParam = searchParams.get("currentStatuses") || ""
    const currentStatuses = currentStatusesParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    // projectIds: CSV list of Mera project ID. Filter cho phần data Mera. Rỗng = tất cả project.
    const projectIdsParam = searchParams.get("projectIds") || ""
    const projectIds = projectIdsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    // includeMera / includeSheet: true/false (mặc định true cả 2). Để user có thể tắt 1 nguồn.
    const includeMera = (searchParams.get("includeMera") ?? "true") === "true"
    const includeSheet = (searchParams.get("includeSheet") ?? "true") === "true"

    const applySheetFilter = (q: any): any => {
      if (sheetIds.length > 0) return q.in("google_sheet_id", sheetIds)
      return q
    }

    // Filter cho query order_history (chung cho cả Sheet & Mera).
    // Mera dùng google_sheet_id = '__mera__' nên cùng schema.
    const applySourceFilter = (q: any): any => {
      if (includeSheet && includeMera) {
        if (sheetIds.length > 0) return q.in("google_sheet_id", [...sheetIds, MERA_SHEET_ID])
        return q
      }
      if (includeSheet) {
        if (sheetIds.length > 0) return q.in("google_sheet_id", sheetIds)
        return q.neq("google_sheet_id", MERA_SHEET_ID)
      }
      if (includeMera) return q.eq("google_sheet_id", MERA_SHEET_ID)
      // cả 2 đều tắt — trả query rỗng bằng filter impossible
      return q.eq("google_sheet_id", "__none__")
    }

    const dateRange = getDateRange(timeRange, startDate, endDate)

    // === Query order_history cho cả Sheet & Mera (Mera log qua /api/mera/* PATCH) ===
    let repairDataRaw: any[] | null = []
    let error: any = null
    {
      let query = supabase
        .from("order_history")
        .select(`
          id,
          item_id,
          google_sheet_id,
          designer,
          change_type,
          created_at,
          product_type,
          order_note,
          users!created_by(email)
        `)
        .eq("status", "NEED REPAIR")
      query = applySourceFilter(query)

      if (dateRange) {
        query = query.gte("created_at", dateRange.start.toISOString()).lt("created_at", dateRange.end.toISOString())
      }

      const result = await query.order("created_at", { ascending: false })
      repairDataRaw = result.data as any[]
      error = result.error
    }

    // Nếu có currentStatuses → lấy map (item_id, google_sheet_id) → status hiện tại từ orders,
    // rồi loại history row không có status hiện tại nằm trong set chọn.
    let currentStatusMap: Map<string, string> | null = null
    if (currentStatuses.length > 0 && includeSheet) {
      let curQuery = supabase.from("orders").select("item_id, google_sheet_id, status").in("status", currentStatuses)
      curQuery = applySheetFilter(curQuery)
      const { data: curRows, error: curErr } = await curQuery
      if (curErr) {
        logServerError(curErr, {
          context: "GET /api/need-repair/stats - current status filter",
          userId: appUser.sub,
          timeRange,
        })
      } else {
        currentStatusMap = new Map(
          (curRows ?? []).map((r: any) => [`${r.item_id}::${r.google_sheet_id}`, r.status]),
        )
      }
    }

    let repairData: any[] = currentStatusMap
      ? (repairDataRaw ?? []).filter((r: any) => {
          if (r.google_sheet_id === MERA_SHEET_ID) return true
          return currentStatusMap!.has(`${r.item_id}::${r.google_sheet_id}`)
        })
      : (repairDataRaw ?? [])

    // === Mera fetch (nếu cần) cho filter projectIds / currentStatuses của Mera rows ===
    if (includeMera && (projectIds.length > 0 || currentStatuses.length > 0)) {
      try {
        const actor = { id: appUser.sub, email: appUser.email }
        const meraOrders = await fetchAllMeraOrders(actor, {})
        const matchProject = (o: MeraOrder) =>
          projectIds.length === 0 || (o.project_id && projectIds.includes(o.project_id))

        const meraCurrentStatusByItem = new Map<string, string>()
        const meraProjectByItem = new Map<string, string | null | undefined>()
        for (const order of meraOrders) {
          const items = order.items ?? []
          for (const item of items) {
            if (!item.item_key) continue
            meraCurrentStatusByItem.set(item.item_key, item.status)
            meraProjectByItem.set(item.item_key, order.project_id)
          }
        }

        if (currentStatuses.length > 0) {
          repairData = repairData.filter((r: any) => {
            if (r.google_sheet_id !== MERA_SHEET_ID) return true
            const cur = meraCurrentStatusByItem.get(r.item_id)
            return cur ? currentStatuses.includes(cur) : false
          })
        }
        if (projectIds.length > 0) {
          repairData = repairData.filter((r: any) => {
            if (r.google_sheet_id !== MERA_SHEET_ID) return true
            const pid = meraProjectByItem.get(r.item_id)
            return pid != null && projectIds.includes(pid)
          })
        }
      } catch (meraErr) {
        logServerError(meraErr as Error, {
          context: "GET /api/need-repair/stats - Mera filter fetch",
          userId: appUser.sub,
          timeRange,
        })
      }
    }

    // === Designer stats từ RPC v2 ===
    // Đơn vị: LƯỢT CHẤM — mỗi row order_history có status CONFIRMED hoặc NEED REPAIR
    // là một lần reviewer chấm bài của designer ĐANG GIỮ ĐƠN lúc đó.
    // Designer = snapshot order_history.designer trên chính row đó (KHÔNG phải designer
    // đầu tiên của đơn như v1) → đơn bị chuyển tay thì lỗi thuộc người gây ra, công
    // thuộc người sửa. Xem scripts/create-designer-repair-stats-rpc-v2.sql.
    // Tỉ lệ = (lượt NR do design_error | customer_change) / (tổng lượt chấm).
    const { data: designerRpcData, error: designerRpcError } = await supabase.rpc(
      "get_designer_repair_stats_v2",
      {
        p_time_from: dateRange?.start.toISOString() ?? null,
        p_time_to: dateRange?.end.toISOString() ?? null,
        p_sheet_ids: sheetIds.length > 0 ? sheetIds : null,
        p_include_sheet: includeSheet,
        p_include_mera: includeMera,
      },
    )
    if (designerRpcError) {
      logServerError(designerRpcError, {
        context: "GET /api/need-repair/stats - RPC get_designer_repair_stats_v2",
        userId: appUser.sub,
        timeRange,
      })
    }

    if (error) {
      logServerError(error, {
        context: "GET /api/need-repair/stats",
        userId: appUser.sub,
        timeRange,
      })
      return NextResponse.json(
        {
          success: false,
          error: "Failed to fetch repair statistics",
          debug: {
            message: "Database query failed",
            details: error.message,
            hint: error.hint,
            code: error.code,
            timestamp: new Date().toISOString(),
          },
        },
        { status: 500 },
      )
    }

    // === Process NEED REPAIR EVENTS (cho detailedRecords, productTypeStats, dailyStats, summary) ===
    // Đây là sự kiện NEED REPAIR trong khoảng dateRange (theo lúc bị mark).
    // Cùng hệ thời gian với designerStats v2 (đều lọc theo created_at của row).
    const changeTypeStats = { design_error: 0, customer_change: 0 }
    const productTypeStats = new Map<string, { times: number; orderIds: Set<string> }>()
    const dailyStats = new Map<string, number>()
    const allOrderIds = new Set<string>()
    // Đơn distinct tách theo loại lỗi — khác allOrderIds ở chỗ không gộp 2 loại.
    // Một đơn bị mark cả 2 loại sẽ nằm trong cả 2 set.
    const designErrorOrderIds = new Set<string>()
    const customerChangeOrderIds = new Set<string>()
    const activeDesigners = new Set<string>()

    repairData?.forEach((record) => {
      const changeType = record.change_type
      const productType = record.product_type || "Unknown"
      const date = vnDateKey(record.created_at)
      const orderKey = record.item_id
        ? `${record.item_id}::${record.google_sheet_id}`
        : `__row_${record.id}`

      allOrderIds.add(orderKey)

      const designerName = String(record.designer ?? "").trim()
      if (designerName) activeDesigners.add(designerName.toLowerCase())

      if (changeType && changeTypeStats.hasOwnProperty(changeType)) {
        changeTypeStats[changeType as keyof typeof changeTypeStats]++
        if (changeType === "design_error") designErrorOrderIds.add(orderKey)
        else customerChangeOrderIds.add(orderKey)
      }

      const product = productTypeStats.get(productType) ?? { times: 0, orderIds: new Set<string>() }
      product.times++
      product.orderIds.add(orderKey)
      productTypeStats.set(productType, product)

      dailyStats.set(date, (dailyStats.get(date) || 0) + 1)
    })

    // === Build designer stats array từ RPC v2 output ===
    // RPC trả về (per designer): total_rounds, distinct_orders, nr_times, de_times, cc_times,
    // orders_nr, orders_de, orders_cc, confirmed_after_repair, repaired_for_others.
    const designerStatsArray = (designerRpcData ?? []).map((row: any) => {
      const rounds = Number(row.total_rounds) || 0
      const distinctOrders = Number(row.distinct_orders) || 0
      const nrTimes = Number(row.nr_times) || 0
      const deTimes = Number(row.de_times) || 0
      const ccTimes = Number(row.cc_times) || 0
      const ordersNr = Number(row.orders_nr) || 0
      const ordersDe = Number(row.orders_de) || 0
      const ordersCc = Number(row.orders_cc) || 0
      return {
        designer: row.designer_display || row.designer || "Unassigned",
        total_rounds: rounds, // "Lượt chấm" = MẪU SỐ
        distinct_orders: distinctOrders, // "Đơn" = số đơn distinct designer có mặt trong kỳ
        nr_times: nrTimes, // "Lượt bị trả" = số lần bị mark NEED REPAIR
        design_error: deTimes, // "Lỗi design" theo LƯỢT
        customer_change: ccTimes, // "Customer change" theo LƯỢT
        orders_need_repair: ordersNr, // số ĐƠN distinct bị trả
        orders_design_error: ordersDe,
        orders_customer_change: ordersCc,
        confirmed_after_repair: Number(row.confirmed_after_repair) || 0, // đơn chốt sau sửa
        repaired_for_others: Number(row.repaired_for_others) || 0, // số lần sửa hộ designer khác
        // Tỉ lệ theo LƯỢT: tử số và mẫu số cùng một quy gán designer nên không bao giờ > 100%.
        rate_design_error: rounds > 0 ? (deTimes / rounds) * 100 : null,
        rate_customer_change: rounds > 0 ? (ccTimes / rounds) * 100 : null,
        rate_need_repair: rounds > 0 ? (nrTimes / rounds) * 100 : null,
        avg_times_per_order: ordersNr > 0 ? nrTimes / ordersNr : 0,
        products: [] as Array<{ product: string; count: number }>,
      }
    })

    const productTypeStatsArray = Array.from(productTypeStats.entries())
      .map(([product, stats]) => ({
        product,
        count: stats.times, // số lần mark
        orders: stats.orderIds.size, // số đơn distinct
      }))
      .sort((a, b) => b.count - a.count)

    const dailyStatsArray = Array.from(dailyStats.entries())
      .map(([date, count]) => ({
        date,
        count,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    const totalTimes = repairData?.length || 0
    const totalOrders = allOrderIds.size

    const detailedRecords =
      repairData?.map((record) => ({
        id: record.id,
        item_id: record.item_id,
        designer: record.designer || "Unassigned",
        product_type: record.product_type || "Unknown",
        order_note: record.order_note,
        change_type: record.change_type,
        created_at: record.created_at,
        users: record.users,
        source: record.google_sheet_id === MERA_SHEET_ID ? "mera" : "sheet",
      })) || []

    logServerInfo("Need repair statistics fetched successfully", {
      userId: appUser.sub,
      timeRange,
      totalOrders,
      totalTimes,
      designerCount: designerStatsArray.length,
    })

    return NextResponse.json({
      success: true,
      data: {
        timeRange,
        dateRange: dateRange
          ? {
              start: dateRange.start.toISOString(),
              end: dateRange.end.toISOString(),
            }
          : null,
        summary: {
          totalOrders, // số ĐƠN distinct cần sửa
          totalTimes, // tổng số LẦN mark NEED REPAIR
          designErrors: changeTypeStats.design_error, // số LẦN có change_type=design_error
          customerChanges: changeTypeStats.customer_change,
          // Số ĐƠN distinct tách theo loại lỗi (khác designErrors/customerChanges vốn đếm theo lần)
          designErrorOrders: designErrorOrderIds.size,
          customerChangeOrders: customerChangeOrderIds.size,
          // Đơn từng bị NR và được CONFIRMED trong kỳ — cộng từ RPC v2.
          confirmedAfterRepair: designerStatsArray.reduce(
            (sum: number, d: any) => sum + (d.confirmed_after_repair || 0),
            0,
          ),
          // Designer bị mark NEED REPAIR trong kỳ (theo sự kiện, cùng hệ với các số trên).
          uniqueDesigners: activeDesigners.size,
          // Số designer có lượt chấm trong kỳ (theo RPC v2) — mẫu số của bảng bên dưới.
          gradedDesigners: designerStatsArray.length,
          // Trường legacy — bằng totalTimes, giữ để không vỡ phần khác nếu còn dùng
          totalRepairs: totalTimes,
        },
        designerStats: designerStatsArray,
        changeTypeStats,
        productTypeStats: productTypeStatsArray,
        dailyStats: dailyStatsArray,
        detailedRecords, // Added detailed records for the new tab
      },
    })
  } catch (error) {
    if (error instanceof Error && (error.message.includes("authorization header") || error.message.includes("token"))) {
      return unauthorizedResponse(error.message)
    }
    logServerError(error as Error, { context: "GET /api/need-repair/stats" })
    return NextResponse.json(
      {
        success: false,
        error: "Internal Server Error",
        debug: {
          message: (error as Error).message,
          stack: (error as Error).stack,
          timestamp: new Date().toISOString(),
        },
      },
      { status: 500 },
    )
  }
}
