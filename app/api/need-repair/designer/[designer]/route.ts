import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getDateRange } from "@/lib/time-range"

export async function GET(request: NextRequest, { params }: { params: { designer: string } }) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
        },
      },
    )

    const { searchParams } = new URL(request.url)
    const timeRange = searchParams.get("timeRange") || "this_week"
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    const designer = decodeURIComponent(params.designer)

    // Build date filter based on time range
    let query = supabase
      .from("order_history")
      .select(`
        id,
        item_id,
        product_type,
        product_name,
        status,
        order_note,
        designer,
        change_type,
        personalization,
        store,
        created_at,
        updated_at,
        users!created_by(email)
      `)
      .eq("status", "NEED REPAIR")
      // ilike (không wildcard) = so khớp không phân biệt hoa thường, cho khớp với
      // cách RPC v2 normalize bằng LOWER(BTRIM()). Escape ký tự wildcard của LIKE
      // để tên có '%' hoặc '_' không biến thành pattern.
      .ilike("designer", designer.replace(/([%_\\])/g, "\\$1"))

    // Apply time filtering — dùng chung getDateRange với /api/need-repair/stats để hai
    // trang ra cùng một khoảng thời gian (giờ VN, tuần bắt đầu Thứ Hai, biên nửa mở).
    // Khối switch tự tính trước đây chạy theo giờ local của process (UTC trên Vercel)
    // nên lệch 7h, và case last_week bị sai do now.setDate() mutate chính `now`.
    const dateRange = getDateRange(timeRange, startDate, endDate)
    if (dateRange) {
      query = query
        .gte("created_at", dateRange.start.toISOString())
        .lt("created_at", dateRange.end.toISOString())
    }

    const { data: repairDetails, error: detailsError } = await query.order("created_at", { ascending: false })

    if (detailsError) {
      console.error("Database error:", detailsError)
      return NextResponse.json({ error: "Failed to fetch repair details" }, { status: 500 })
    }

    const totalRepairs = repairDetails?.length || 0
    const designErrors = repairDetails?.filter((item) => item.change_type === "design_error").length || 0
    const customerChanges = repairDetails?.filter((item) => item.change_type === "customer_change").length || 0
    const productTypesAffected = new Set(repairDetails?.map((item) => item.product_type).filter(Boolean)).size

    const productBreakdownMap = new Map()
    repairDetails?.forEach((item) => {
      if (!item.product_type) return

      if (!productBreakdownMap.has(item.product_type)) {
        productBreakdownMap.set(item.product_type, {
          product_type: item.product_type,
          count: 0,
          design_errors: 0,
          customer_changes: 0,
        })
      }

      const breakdown = productBreakdownMap.get(item.product_type)
      breakdown.count++

      if (item.change_type === "design_error") {
        breakdown.design_errors++
      }
      if (item.change_type === "customer_change") {
        breakdown.customer_changes++
      }
    })

    const productBreakdown = Array.from(productBreakdownMap.values()).sort((a, b) => b.count - a.count)

    return NextResponse.json({
      success: true,
      data: {
        designer,
        summary: {
          total_repairs: totalRepairs,
          design_errors: designErrors,
          customer_changes: customerChanges,
          product_types_affected: productTypesAffected,
        },
        repairDetails: repairDetails || [],
        productBreakdown,
      },
    })
  } catch (error) {
    console.error("API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
