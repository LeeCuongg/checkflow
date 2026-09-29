import { type NextRequest, NextResponse } from "next/server"
import { meraClient } from "@/lib/mera-client"
import { badRequest, isNonEmptyString, meraErrorResponse, readJsonBody, requireActor } from "@/lib/mera-proxy"
import type { CheckflowBaseTemplateConfirmRequest } from "@/types/mera-base-template"

// POST /api/mera/base-templates/confirm
// body { project_id, product_type, design_link, signatures, expected_status }
// → Mera POST /api/v1/projects/:project_id/base-template/confirm
//
// `signatures` is REQUIRED here (may be []): its presence is what switches Mera to the
// new mode (learn the values + cascade waiting orders when the switch is ON). Letting it
// through absent would silently fall back to the legacy flag-only behaviour.
export async function POST(request: NextRequest) {
  const auth = await requireActor(request)
  if ("response" in auth) return auth.response

  const body = await readJsonBody<Partial<CheckflowBaseTemplateConfirmRequest>>(request)
  if (!body) return badRequest("Invalid JSON body")

  const { project_id, product_type, design_link, signatures, expected_status } = body
  if (!isNonEmptyString(project_id)) return badRequest("project_id is required")
  if (!isNonEmptyString(product_type)) return badRequest("product_type is required")
  if (!isNonEmptyString(design_link)) return badRequest("design_link is required")
  if (!Array.isArray(signatures) || !signatures.every((s) => typeof s === "string")) {
    return badRequest("signatures must be an array of strings")
  }
  if (expected_status !== undefined && typeof expected_status !== "string") {
    return badRequest("expected_status must be a string")
  }

  try {
    const data = await meraClient.confirmBaseTemplate(auth.actor, project_id, {
      product_type,
      design_link,
      signatures,
      ...(expected_status !== undefined ? { expected_status } : {}),
    })
    return NextResponse.json(data)
  } catch (err) {
    return meraErrorResponse(err, "POST /api/mera/base-templates/confirm")
  }
}
