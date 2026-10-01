import { type NextRequest, NextResponse } from "next/server"
import { meraClient } from "@/lib/mera-client"
import { meraErrorResponse, requireActor } from "@/lib/mera-proxy"
import { BASE_TEMPLATE_PAGE_LIMIT } from "@/types/mera-base-template"
import {
  type BaseTemplateCounts,
  flattenEntries,
  hasWaitingOrders,
  isConfirmed,
  isNeedRepair,
  lastConfirmation,
  vnDay,
} from "@/components/base-templates/utils"

export const dynamic = "force-dynamic"

// GET /api/mera/base-templates/counts?nocache=true
// Every project. Loads the same two lists as the /base-templates page, but answers only the
// numbers so the sidebar / Order Review card do not pull every variant into the browser.
export async function GET(request: NextRequest) {
  const auth = await requireActor(request)
  if ("response" in auth) return auth.response

  const nocache = request.nextUrl.searchParams.get("nocache") === "true"
  const base = { limit: BASE_TEMPLATE_PAGE_LIMIT, nocache }

  try {
    const [queue, repair, confirmed] = await Promise.all([
      meraClient.listBaseTemplates(auth.actor, { ...base, queue: true }),
      meraClient.listBaseTemplates(auth.actor, { ...base, status: "NEED REPAIR" }),
      meraClient.listBaseTemplates(auth.actor, { ...base, status: "CONFIRMED" }),
    ])
    const lists = [queue, repair, confirmed]
    const confirmedEntries = flattenEntries(confirmed.items ?? [], isConfirmed)
    const today = vnDay(new Date())
    const body: BaseTemplateCounts = {
      waiting: flattenEntries(queue.items ?? [], hasWaitingOrders).length,
      repair: flattenEntries(repair.items ?? [], isNeedRepair).length,
      confirmed: confirmedEntries.length,
      confirmedToday: confirmedEntries.filter((e) => {
        const c = lastConfirmation(e.variant)
        return !!c && vnDay(c.at) === today
      }).length,
      partial: lists.some((l) => (l.total ?? 0) > (l.items ?? []).length),
    }
    return NextResponse.json(body)
  } catch (err) {
    return meraErrorResponse(err, "GET /api/mera/base-templates/counts")
  }
}
