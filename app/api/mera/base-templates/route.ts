import { type NextRequest, NextResponse } from "next/server"
import { meraClient } from "@/lib/mera-client"
import { meraErrorResponse, requireActor } from "@/lib/mera-proxy"
import type { BaseTemplateListParams } from "@/types/mera-base-template"

export const dynamic = "force-dynamic"

// GET /api/mera/base-templates?project_id=&queue=true&nocache=true&status=&search=&page=&limit=
// → Mera GET /api/v1/base-templates (internal key + X-Actor-Email = checker).
export async function GET(request: NextRequest) {
  const auth = await requireActor(request)
  if ("response" in auth) return auth.response

  const sp = request.nextUrl.searchParams
  const num = (key: string) => {
    const n = Number(sp.get(key))
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined
  }
  const params: BaseTemplateListParams = {
    project_id: sp.get("project_id")?.trim() || undefined,
    status: sp.get("status")?.trim() || undefined,
    pending: sp.get("pending") === "true",
    queue: sp.get("queue") === "true" || sp.get("queue") === "1",
    nocache: sp.get("nocache") === "true" || sp.get("nocache") === "1",
    search: sp.get("search")?.trim() || undefined,
    page: num("page"),
    limit: num("limit"),
  }

  try {
    const data = await meraClient.listBaseTemplates(auth.actor, params)
    return NextResponse.json(data)
  } catch (err) {
    return meraErrorResponse(err, "GET /api/mera/base-templates")
  }
}
