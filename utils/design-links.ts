import { GoogleDriveClient } from "@/lib/google-drive-client"
import { googleSheetsClient } from "@/lib/google-sheets-client"
import { isDriveUrl } from "@/lib/drive-image"

// A design link cell can contain multiple URLs separated by newlines/spaces/commas,
// and each URL can be a single Drive file or a Drive folder holding several files.

export const parseDesignLinks = (raw?: string | null): string[] => {
  if (!raw) return []
  const urls = raw.match(/https?:\/\/[^\s,;"']+/g) || []
  // Dedupe while preserving order
  return Array.from(new Set(urls))
}

export const isDriveFolderUrl = (url: string): boolean => GoogleDriveClient.isFolderUrl(url)

// CONFIRM on an order whose design links are all off Drive (e.g. the web store) skips
// CONFIRMED and goes straight to WEB CHECKED. No design link at all keeps CONFIRMED.
export const confirmTargetStatus = (designLink?: string | null): "CONFIRMED" | "WEB CHECKED" => {
  const links = parseDesignLinks(designLink)
  return links.length > 0 && !links.some(isDriveUrl) ? "WEB CHECKED" : "CONFIRMED"
}

// Cache resolved lists per raw designLink value so repeated opens don't re-hit the API
const resolvedCache = new Map<string, Promise<string[]>>()

// Expand a raw designLink value into a flat list of individual file URLs.
// Folder links are expanded into one URL per image file inside the folder.
export function resolveDesignUrls(raw?: string | null): Promise<string[]> {
  const links = parseDesignLinks(raw)
  if (links.length === 0) return Promise.resolve([])
  if (!links.some(isDriveFolderUrl)) return Promise.resolve(links)

  const cacheKey = links.join("\n")
  if (resolvedCache.has(cacheKey)) {
    return resolvedCache.get(cacheKey)!
  }

  const promise = (async () => {
    const accessToken = await googleSheetsClient.getValidAccessToken()
    const driveClient = new GoogleDriveClient({ accessToken })
    const result: string[] = []

    for (const link of links) {
      if (isDriveFolderUrl(link)) {
        try {
          const files = await driveClient.listFolderFiles(link)
          result.push(...files.map((f) => `https://drive.google.com/open?id=${f.id}`))
        } catch (error) {
          console.error("[design-links] Failed to expand folder link:", link, error)
        }
      } else {
        result.push(link)
      }
    }

    return Array.from(new Set(result))
  })()

  promise.catch(() => resolvedCache.delete(cacheKey))
  resolvedCache.set(cacheKey, promise)
  return promise
}

// Manual refresh should re-read folders, otherwise files added after the first
// expansion stay invisible until a full page reload.
export function clearResolvedDesignLinks() {
  resolvedCache.clear()
  GoogleDriveClient.clearCache()
}
