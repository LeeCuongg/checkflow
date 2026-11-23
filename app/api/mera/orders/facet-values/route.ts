import { type NextRequest, NextResponse } from "next/server"
import { meraClient } from "@/lib/mera-client"
import { badRequest, meraErrorResponse, readJsonBody, requireActor } from "@/lib/mera-proxy"
import {
  MERA_FACET_FIELDS,
  type MeraFacetField,
  type MeraFacetFilters,
  type MeraFacets,
} from "@/types/mera-order"

export const dynamic = "force-dynamic"

// POST /api/mera/orders/facet-values  { fields, project_id?, q?, statuses?, column_filters? }
// The filter options of Order Review (designer / product type / store) taken from EVERY order
// matching the current filters. Reading them off the loaded page hides the values that only
// exist on other pages.
export async function POST(request: NextRequest) {
  const auth = await requireActor(request)
  if ("response" in auth) return auth.response

  const body = await readJsonBody<MeraFacetFilters & { fields?: unknown }>(request)
  if (!body) return badRequest("invalid request body")

  const fields = (Array.isArray(body.fields) ? body.fields : []).filter((f): f is MeraFacetField =>
    (MERA_FACET_FIELDS as readonly string[]).includes(f as string)
  )
  if (fields.length === 0) return badRequest("fields is required")

  const filters: MeraFacetFilters = {
    project_id: body.project_id || undefined,
    q: body.q || undefined,
    statuses: body.statuses?.length ? body.statuses : undefined,
    column_filters: body.column_filters,
  }

  try {
    const results = await Promise.all(fields.map((f) => meraClient.getOrderFacetValues(auth.actor, f, filters)))
    const facets: MeraFacets = {}
    fields.forEach((f, i) => {
      facets[f] = results[i]
    })
    return NextResponse.json({ facets })
  } catch (err) {
    return meraErrorResponse(err, "POST /api/mera/orders/facet-values")
  }
}
