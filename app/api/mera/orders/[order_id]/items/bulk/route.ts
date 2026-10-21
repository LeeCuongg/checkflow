import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth"
import { meraClient } from "@/lib/mera-client"
import { createServerClient } from "@/lib/supabase"
import { logServerError } from "@/lib/server-sentry"
import { logMeraStatusHistory } from "@/lib/mera-history"
import { postNeedRepairComment } from "@/lib/post-need-repair-comment"
import type { MeraBulkPatchItemsBody } from "@/types/mera-order"

type ExtendedBody = MeraBulkPatchItemsBody & {
  change_type?: "design_error" | "customer_change" | null
  order_note?: string | null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ order_id: string }> }
) {
  try {
    const appUser = await authenticateRequest(request)
    const actor = { id: appUser.sub, email: appUser.email }
    const { order_id } = await params
    const { change_type, order_note, ...meraBody } = (await request.json()) as ExtendedBody

    const newStatus = meraBody.fields?.status
    if (newStatus === "NEED REPAIR" && !change_type) {
      return NextResponse.json(
        { error: "change_type required when status is NEED REPAIR" },
        { status: 400 }
      )
    }
    if (change_type && !["design_error", "customer_change"].includes(change_type)) {
      return NextResponse.json({ error: "Invalid change_type" }, { status: 400 })
    }

    const data = await meraClient.bulkPatchItems(actor, order_id, meraBody)

    if (newStatus) {
      const supabase = createServerClient()
      await Promise.all(
        (data.items ?? []).map((item) =>
          logMeraStatusHistory(supabase, {
            item,
            status: newStatus,
            changeType: change_type ?? null,
            orderNote: order_note ?? null,
            createdBy: appUser.sub,
          })
        )
      )
      if (newStatus === "NEED REPAIR") {
        await Promise.all(
          (data.items ?? [])
            .filter((item) => meraBody.item_keys.includes(item.item_key))
            .map((item) =>
              postNeedRepairComment(supabase, {
                itemKey: item.item_key,
                actor: { id: appUser.sub, email: appUser.email, name: appUser.name },
                changeType: change_type,
                note: order_note,
              })
            )
        )
      }
    }

    return NextResponse.json(data)
  } catch (err) {
    if ((err as Error).message?.includes("Missing") || (err as Error).message?.includes("Invalid")) {
      return unauthorizedResponse((err as Error).message)
    }
    logServerError(err as Error, { route: "PATCH /api/mera/orders/[order_id]/items/bulk" })
    const meraErr = err as { status?: number; detail?: unknown }
    const status = meraErr.status && meraErr.status >= 400 ? meraErr.status : 500
    return NextResponse.json(
      status === 409 ? meraErr.detail : { error: (err as Error).message, detail: meraErr.detail },
      { status }
    )
  }
}
