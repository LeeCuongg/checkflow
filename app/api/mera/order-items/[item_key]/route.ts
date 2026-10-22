import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth"
import { meraClient } from "@/lib/mera-client"
import { createServerClient } from "@/lib/supabase"
import { logServerError } from "@/lib/server-sentry"
import { logMeraStatusHistory } from "@/lib/mera-history"
import { postNeedRepairComment } from "@/lib/post-need-repair-comment"
import type { MeraPatchItemBody } from "@/types/mera-order"

type ExtendedBody = MeraPatchItemBody & {
  change_type?: "design_error" | "customer_change" | null
  order_note?: string | null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ item_key: string }> }
) {
  try {
    const appUser = await authenticateRequest(request)
    const actor = { id: appUser.sub, email: appUser.email }
    const { item_key } = await params
    const { change_type, order_note, ...meraBody } = (await request.json()) as ExtendedBody

    if (meraBody.status === "NEED REPAIR" && !change_type) {
      return NextResponse.json(
        { error: "change_type required when status is NEED REPAIR" },
        { status: 400 }
      )
    }
    if (change_type && !["design_error", "customer_change"].includes(change_type)) {
      return NextResponse.json({ error: "Invalid change_type" }, { status: 400 })
    }

    const data = await meraClient.patchItem(actor, item_key, meraBody)

    if (meraBody.status) {
      const supabase = createServerClient()
      await logMeraStatusHistory(supabase, {
        item: data,
        status: meraBody.status,
        changeType: change_type ?? null,
        orderNote: order_note ?? null,
        createdBy: appUser.sub,
      })
      if (meraBody.status === "NEED REPAIR") {
        // Marker only: order_note is support's note on the order, not the reason for this repair.
        await postNeedRepairComment(supabase, {
          itemKey: data.item_key,
          actor: { id: appUser.sub, email: appUser.email, name: appUser.name },
          changeType: change_type,
        })
      }
    }

    return NextResponse.json(data)
  } catch (err) {
    if ((err as Error).message?.includes("Missing") || (err as Error).message?.includes("Invalid")) {
      return unauthorizedResponse((err as Error).message)
    }
    logServerError(err as Error, { route: "PATCH /api/mera/order-items/[item_key]" })
    const meraErr = err as { status?: number; detail?: unknown }
    const status = meraErr.status && meraErr.status >= 400 ? meraErr.status : 500
    return NextResponse.json(
      status === 409 ? meraErr.detail : { error: (err as Error).message, detail: meraErr.detail },
      { status }
    )
  }
}
