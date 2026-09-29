import { type NextRequest, NextResponse } from "next/server"
import { meraClient } from "@/lib/mera-client"
import { meraErrorResponse, requireActor } from "@/lib/mera-proxy"

export const dynamic = "force-dynamic"

// GET /api/mera/base-template-settings → Mera GET /api/v1/base-template-settings.
// Read-only here: the switch is toggled on the Mera Base Templates page, not in checkflow.
export async function GET(request: NextRequest) {
  const auth = await requireActor(request)
  if ("response" in auth) return auth.response

  try {
    const data = await meraClient.getBaseTemplateSettings(auth.actor)
    return NextResponse.json(data)
  } catch (err) {
    return meraErrorResponse(err, "GET /api/mera/base-template-settings")
  }
}
