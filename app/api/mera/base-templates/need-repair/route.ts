import { type NextRequest, NextResponse } from "next/server"
import { meraClient } from "@/lib/mera-client"
import { postNeedRepairComment } from "@/lib/post-need-repair-comment"
import { createServerClient } from "@/lib/supabase"
import { badRequest, isNonEmptyString, meraErrorResponse, readJsonBody, requireActor } from "@/lib/mera-proxy"
import type { CheckflowBaseTemplateNeedRepairRequest } from "@/types/mera-base-template"

// POST /api/mera/base-templates/need-repair
// body { project_id, product_type, design_link, note, comment_key? }
// → Mera POST /api/v1/projects/:project_id/base-template/need-repair
// Mera recalls the variant's orders to NEED REPAIR regardless of the auto-status switch.
// comment_key = the variant's Discussion key (baseTemplateCommentKey): on success the NEED
// REPAIR status message (+ note) is appended to that thread.
export async function POST(request: NextRequest) {
  const auth = await requireActor(request)
  if ("response" in auth) return auth.response

  const body = await readJsonBody<Partial<CheckflowBaseTemplateNeedRepairRequest>>(request)
  if (!body) return badRequest("Invalid JSON body")

  const { project_id, product_type, design_link, note, comment_key } = body
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
    if (isNonEmptyString(comment_key) && comment_key.startsWith("bt:")) {
      await postNeedRepairComment(createServerClient(), {
        itemKey: comment_key,
        actor: auth.actor,
        scope: "Base template",
        note,
      })
    }
    return NextResponse.json(data)
  } catch (err) {
    return meraErrorResponse(err, "POST /api/mera/base-templates/need-repair")
  }
}
