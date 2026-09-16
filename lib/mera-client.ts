import { MERA_API_URL, MERA_INTERNAL_API_KEY } from "@/lib/env"
import { logServerError } from "@/lib/server-sentry"
import type {
  MeraActor,
  MeraBulkPatchItemsBody,
  MeraListOrdersParams,
  MeraListOrdersResponse,
  MeraOrder,
  MeraOrderItem,
  MeraPatchItemBody,
  MeraPatchOrderBody,
  MeraProject,
} from "@/types/mera-order"

function buildMeraApiError(message: string, status: number, detail?: unknown): Error & { status: number; detail?: unknown } {
  const err = new Error(message) as Error & { status: number; detail?: unknown }
  err.status = status
  err.detail = detail
  return err
}

class MeraClient {
  private baseUrl: string
  private apiKey: string

  constructor() {
    this.baseUrl = MERA_API_URL
    this.apiKey = MERA_INTERNAL_API_KEY
  }

  private async request<T>(
    method: string,
    path: string,
    options?: { actor?: MeraActor; body?: unknown; params?: Record<string, string> }
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`)

    if (options?.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined && value !== "") {
          url.searchParams.set(key, value)
        }
      }
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    }

    if (options?.actor) {
      headers["X-Actor-Email"] = options.actor.email
    }

    const res = await fetch(url.toString(), {
      method,
      headers,
      body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    })

    if (!res.ok) {
      let detail: unknown
      try {
        detail = await res.json()
      } catch {
        detail = await res.text()
      }
      const err = buildMeraApiError(
        `Mera API error ${res.status}: ${path}`,
        res.status,
        detail
      )
      logServerError(err, { path, status: res.status, detail })
      throw err
    }

    return res.json() as Promise<T>
  }

  async listProjects(actor?: MeraActor): Promise<MeraProject[]> {
    const data = await this.request<{ projects: MeraProject[] }>("GET", "/api/v1/projects", { actor })
    return data.projects
  }

  async listOrders(actor: MeraActor, params: MeraListOrdersParams): Promise<MeraListOrdersResponse> {
    const queryParams: Record<string, string> = {}

    if (params.page) queryParams.page = String(params.page)
    if (params.page_size) queryParams.page_size = String(params.page_size)
    if (params.channel) queryParams.channel = params.channel
    if (params.status) queryParams.status = params.status
    if (params.store) queryParams.store = params.store
    if (params.provider) queryParams.provider = params.provider
    if (params.designer) queryParams.designer = params.designer
    if (params.project_id) queryParams.project_id = params.project_id
    if (params.q) queryParams.q = params.q
    if (params.include_items) queryParams.include_items = "true"
    if (params.date_from) queryParams.date_from = params.date_from
    if (params.date_to) queryParams.date_to = params.date_to

    const url = new URL(`${this.baseUrl}/api/v2/orders`)
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.set(key, value)
    }
    // statuses is a repeated param
    if (params.statuses?.length) {
      for (const s of params.statuses) {
        url.searchParams.append("statuses", s)
      }
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      "X-Actor-Email": actor.email,
    }

    const res = await fetch(url.toString(), { method: "GET", headers })
    if (!res.ok) {
      let detail: unknown
      try { detail = await res.json() } catch { detail = await res.text() }
      const err = buildMeraApiError(`Mera API error ${res.status}: /api/v2/orders`, res.status, detail)
      logServerError(err, { status: res.status, detail })
      throw err
    }
    return res.json() as Promise<MeraListOrdersResponse>
  }

  async patchOrder(actor: MeraActor, orderId: string, body: MeraPatchOrderBody): Promise<MeraOrder> {
    return this.request<MeraOrder>("PATCH", `/api/v2/orders/${encodeURIComponent(orderId)}`, { actor, body })
  }

  async patchItem(actor: MeraActor, itemKey: string, body: MeraPatchItemBody): Promise<MeraOrderItem> {
    return this.request<MeraOrderItem>("PATCH", `/api/v2/order-items/${encodeURIComponent(itemKey)}`, { actor, body })
  }

  async bulkPatchItems(
    actor: MeraActor,
    orderId: string,
    body: MeraBulkPatchItemsBody
  ): Promise<{ items: MeraOrderItem[] }> {
    return this.request<{ items: MeraOrderItem[] }>(
      "PATCH",
      `/api/v2/orders/${encodeURIComponent(orderId)}/items/bulk`,
      { actor, body }
    )
  }
}

export const meraClient = new MeraClient()
