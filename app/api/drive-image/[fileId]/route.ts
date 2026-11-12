import { type NextRequest, NextResponse } from "next/server"
import { verifyImageToken } from "@/lib/image-token"
import { getDriveAccessToken, invalidateDriveAccessToken, DriveAuthError } from "@/lib/google-drive-server"
import { logServerError } from "@/lib/server-sentry"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const FILE_ID_PATTERN = /^[a-zA-Z0-9_-]{8,}$/
// 200 = the small thumbnails (list rows, sample-order chips) — without it those requests 400
// and LazyImage burns its retries (re-minting the image token) before falling back.
const ALLOWED_SIZES = [200, 400, 800, 1600, 2560, 4096]

// Bytes for a given (fileId, size) never change, and the token in the URL keeps the
// cache entry scoped to one user — so the browser may keep it indefinitely.
const IMMUTABLE_CACHE = "private, max-age=31536000, immutable"

function upstreamUrl(fileId: string, size: number | null) {
  if (size) {
    return `https://www.googleapis.com/drive/v3/files/${fileId}?fields=thumbnailLink&supportsAllDrives=true`
  }
  return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`
}

// thumbnailLink comes back as ".../xxxx=s220" (sometimes "=w200-h150"); the trailing
// size directive is swappable for a bigger one.
function resizeThumbnailLink(link: string, size: number) {
  return link.replace(/=[-\w]+$/, `=s${size}`)
}

async function fetchFromDrive(fileId: string, size: number | null, accessToken: string): Promise<Response> {
  const response = await fetch(upstreamUrl(fileId, size), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!size) return response

  if (!response.ok) return response

  const meta = await response.json()

  // Files Drive never generated a thumbnail for (too large, unsupported format) still
  // have to render — serve the original bytes rather than failing the request.
  if (!meta.thumbnailLink) return fetchFromDrive(fileId, null, accessToken)

  // The thumbnail host serves the bytes off Google's CDN and needs no auth header.
  return fetch(resizeThumbnailLink(meta.thumbnailLink, size))
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params
  const sizeParam = request.nextUrl.searchParams.get("s")
  const token = request.nextUrl.searchParams.get("k") ?? request.headers.get("authorization")?.replace(/^Bearer /, "")

  if (!FILE_ID_PATTERN.test(fileId)) {
    return NextResponse.json({ error: "Invalid file id" }, { status: 400 })
  }

  if (!token) {
    return NextResponse.json({ error: "Missing image token" }, { status: 401 })
  }

  let userId: string
  try {
    userId = await verifyImageToken(token)
  } catch {
    return NextResponse.json({ error: "Invalid or expired image token" }, { status: 401 })
  }

  const size = sizeParam ? Number(sizeParam) : null
  if (size !== null && !ALLOWED_SIZES.includes(size)) {
    return NextResponse.json({ error: "Unsupported size" }, { status: 400 })
  }

  try {
    let accessToken = await getDriveAccessToken(userId)
    let upstream = await fetchFromDrive(fileId, size, accessToken)

    // A rejected token usually means our cached copy went stale — refresh once.
    if (upstream.status === 401) {
      invalidateDriveAccessToken(userId)
      accessToken = await getDriveAccessToken(userId)
      upstream = await fetchFromDrive(fileId, size, accessToken)
    }

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "")
      logServerError(new Error(`Drive image fetch failed: HTTP ${upstream.status}`), {
        context: "GET /api/drive-image/[fileId]",
        userId,
        fileId,
        size,
        detail: detail.slice(0, 500),
      })
      return NextResponse.json({ error: "Failed to fetch image from Drive" }, { status: upstream.status })
    }

    const headers = new Headers({
      "Content-Type": upstream.headers.get("content-type") || "image/jpeg",
      "Cache-Control": IMMUTABLE_CACHE,
    })

    const contentLength = upstream.headers.get("content-length")
    if (contentLength) headers.set("Content-Length", contentLength)

    return new NextResponse(upstream.body, { status: 200, headers })
  } catch (error) {
    if (error instanceof DriveAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    logServerError(error as Error, { context: "GET /api/drive-image/[fileId]", userId, fileId })
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
