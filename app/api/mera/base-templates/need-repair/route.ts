import { type NextRequest, NextResponse } from "next/server"
import { meraClient } from "@/lib/mera-client"
import { badRequest, isNonEmptyString, meraErrorResponse, readJsonBody, requireActor } from "@/lib/mera-proxy"
import type { CheckflowBaseTemplateNeedRepairRequest } from "@/types/mera-base-template"

// POST /api/mera/base-templates/need-repair
// body { project_id, product_type, design_link, note }
// → Mera POST /api/v1/projects/:project_id/base-template/need-repair
// Mera recalls the variant's orders to NEED REPAIR regardless of the auto-status switch.
export async function POST(request: NextRequest) {
  const auth = await requireActor(request)
  if ("response" in auth) return auth.response

  const body = await readJsonBody<Partial<CheckflowBaseTemplateNeedRepairRequest>>(request)
  if (!body) return badRequest("Invalid JSON body")

  const { project_id, product_type, design_link, note } = body
  if (!isNonEmptyString(project_id)) return badRequest("project_id is required")
  if (!isNonEmptyString(product_type)) return badRequest("product_type is required")
  if (!isNonEmptyString(design_link)) return badRequest("design_link is required")
  if (!isNonEmptyString(note)) return badRequest("note is required")

  try {
    const data = await meraClient.needRepairBaseTemplate(auth.actor, project_id, {
      product_type,
      design_link,
      note: note.trim(),
    })
    return NextResponse.json(data)
  } catch (err) {
    return meraErrorResponse(err, "POST /api/mera/base-templates/need-repair")
  }
}
