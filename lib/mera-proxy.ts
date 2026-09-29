import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth"
import { logServerError } from "@/lib/server-sentry"
import type { MeraActor } from "@/types/mera-order"

// Shared plumbing for the /api/mera/base-templates* proxies.
//
// Auth is checked in its own step so a Mera error message can never be mistaken for an
// auth failure (the older routes sniff "Missing"/"Invalid" in one catch-all).

export async function requireActor(
  request: NextRequest
): Promise<{ actor: MeraActor } | { response: NextResponse }> {
  try {
    const appUser = await authenticateRequest(request)
    if (!appUser.email) return { response: unauthorizedResponse("Token has no email") }
    return { actor: { id: appUser.sub, email: appUser.email } }
  } catch (err) {
    return { response: unauthorizedResponse((err as Error).message) }
  }
}

// Forward Mera's status and body verbatim (409 conflict body included) so the page can
// read `code` / `current_status` / `error` exactly as Mera sent them. Anything that is not
// a Mera HTTP error (network, bug) becomes a 502/500 with a plain `{ error }`.
export function meraErrorResponse(err: unknown, route: string): NextResponse {
  const meraErr = err as { status?: number; detail?: unknown; message?: string }
  logServerError(err as Error, { route })

  if (meraErr.status && meraErr.status >= 400) {
    const body =
      meraErr.detail && typeof meraErr.detail === "object"
        ? meraErr.detail
        : { error: typeof meraErr.detail === "string" && meraErr.detail ? meraErr.detail : meraErr.message }
    return NextResponse.json(body, { status: meraErr.status })
  }

  return NextResponse.json({ error: meraErr.message || "Mera request failed" }, { status: 502 })
}

export async function readJsonBody<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}

export const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 })

export const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.trim() !== ""
