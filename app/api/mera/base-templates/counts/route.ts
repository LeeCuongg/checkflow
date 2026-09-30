import { type NextRequest, NextResponse } from "next/server"
import { meraClient } from "@/lib/mera-client"
import { meraErrorResponse, requireActor } from "@/lib/mera-proxy"
import { BASE_TEMPLATE_PAGE_LIMIT } from "@/types/mera-base-template"
import {
  type BaseTemplateCounts,
  flattenEntries,
  hasWaitingOrders,
  isNeedRepair,
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
    const [queue, repair] = await Promise.all([
      meraClient.listBaseTemplates(auth.actor, { ...base, queue: true }),
      meraClient.listBaseTemplates(auth.actor, { ...base, status: "NEED REPAIR" }),
    ])
    const queueItems = queue.items ?? []
    const repairItems = repair.items ?? []
    const body: BaseTemplateCounts = {
      waiting: flattenEntries(queueItems, hasWaitingOrders).length,
      repair: flattenEntries(repairItems, isNeedRepair).length,
      partial: (queue.total ?? 0) > queueItems.length || (repair.total ?? 0) > repairItems.length,
    }
    return NextResponse.json(body)
  } catch (err) {
    return meraErrorResponse(err, "GET /api/mera/base-templates/counts")
  }
}
