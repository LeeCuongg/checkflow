// Client-side helpers for displaying Google Drive images through our own proxy
// (/api/drive-image/[fileId]) instead of downloading the original bytes into a blob.
//
// Going through the proxy gives us three things the blob approach could not:
//   - a same-origin URL that <img> can load progressively (no "blank until 100%")
//   - a cheap thumbnail variant to show while the original is still downloading
//   - real HTTP caching, so a reload or a revisit does not re-download anything

const FILE_ID_PATTERNS = [/\/file\/d\/([a-zA-Z0-9_-]+)/, /[?&]id=([a-zA-Z0-9_-]+)/, /\/d\/([a-zA-Z0-9_-]+)/]

const TOKEN_STORAGE_KEY = "drive-image-token"
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

export const PREVIEW_SIZE = 1600

// Both the preview and the "full" image are rendered by Google, never the raw bytes
// off Drive. That matters for colour: originals are often CMYK or carry a non-sRGB ICC
// profile, and Chrome renders those differently than Drive's own preview does — so the
// same file looked different on the web than on Drive, and shifted mid-load when the
// preview swapped for the original. Going through one pipeline for both keeps the web
// matching what the designer sees on Drive.
export const FULL_SIZE = 4096

interface StoredToken {
  token: string
  expiresAt: number
}

let cachedToken: StoredToken | null = null
let inFlightToken: Promise<string> | null = null

export function isDriveUrl(url: string | null | undefined): boolean {
  return !!url && url.includes("drive.google.com")
}

export function extractDriveFileId(url: string | null | undefined): string | null {
  if (!url) return null
  for (const pattern of FILE_ID_PATTERNS) {
    const match = url.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

function isUsable(token: StoredToken | null): token is StoredToken {
  return !!token && Date.now() < token.expiresAt - TOKEN_REFRESH_BUFFER_MS
}

function readStoredToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredToken
    return parsed?.token ? parsed : null
  } catch {
    return null
  }
}

export function clearImageToken() {
  cachedToken = null
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function peekImageToken(): string | null {
  if (isUsable(cachedToken)) return cachedToken.token

  const stored = readStoredToken()
  if (isUsable(stored)) {
    cachedToken = stored
    return stored.token
  }

  return null
}

export async function getImageToken(): Promise<string> {
  const existing = peekImageToken()
  if (existing) return existing

  if (inFlightToken) return inFlightToken

  inFlightToken = (async () => {
    const response = await fetch("/api/auth/image-token", {
      headers: { Authorization: `Bearer ${localStorage.getItem("auth-token")}` },
    })

    if (!response.ok) {
      throw new Error(`Failed to get image token: HTTP ${response.status}`)
    }

    const result = await response.json()
    if (!result?.data?.token) {
      throw new Error("Image token response was empty")
    }

    const token: StoredToken = { token: result.data.token, expiresAt: result.data.expiresAt }
    cachedToken = token

    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token))
    } catch {
      // ignore quota errors — the in-memory copy still works for this session
    }

    return token.token
  })().finally(() => {
    inFlightToken = null
  })

  return inFlightToken
}

interface DriveImageUrlOptions {
  /** Request a downscaled preview instead of the original file. */
  size?: number
  /** Cache-busting attempt counter used when retrying a failed load. */
  attempt?: number
}

// "Tải lại ảnh" epoch. The proxy answers with an immutable cache header, so the browser
// would keep serving the old bytes of a file that was replaced on Drive; the epoch is part
// of every proxy URL, and bumping it makes each image a new URL — refetched from Drive.
let imageEpoch = 0
const epochListeners = new Set<() => void>()

export function getImageEpoch(): number {
  return imageEpoch
}

export function subscribeImageEpoch(listener: () => void): () => void {
  epochListeners.add(listener)
  return () => {
    epochListeners.delete(listener)
  }
}

export function bumpImageEpoch() {
  imageEpoch += 1
  epochListeners.forEach((l) => l())
}

function buildUrl(fileId: string, token: string, { size, attempt }: DriveImageUrlOptions = {}) {
  const params = new URLSearchParams({ k: token })
  if (imageEpoch) params.set("v", String(imageEpoch))
  if (size) params.set("s", String(size))
  if (attempt) params.set("r", String(attempt))
  return `/api/drive-image/${fileId}?${params.toString()}`
}

/** Synchronous variant — returns null when no image token is cached yet. */
export function peekDriveImageUrl(url: string | null | undefined, options?: DriveImageUrlOptions): string | null {
  const fileId = extractDriveFileId(url)
  if (!fileId) return null

  const token = peekImageToken()
  if (!token) return null

  return buildUrl(fileId, token, options)
}

export async function buildDriveImageUrl(
  url: string | null | undefined,
  options?: DriveImageUrlOptions,
): Promise<string | null> {
  const fileId = extractDriveFileId(url)
  if (!fileId) return null

  const token = await getImageToken()
  return buildUrl(fileId, token, options)
}
