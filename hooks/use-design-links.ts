"use client"

import { useState, useEffect } from "react"
import { parseDesignLinks, isDriveFolderUrl, resolveDesignUrls } from "@/utils/design-links"
import { useImageEpoch } from "@/hooks/use-image-refresh"

// Resolve an order's designLink field into a flat list of individual file URLs.
// Direct links show immediately; folder links are expanded async via the Drive API.
export function useDesignLinks(designLink?: string | null): string[] {
  const imageEpoch = useImageEpoch()
  const [urls, setUrls] = useState<string[]>(() =>
    parseDesignLinks(designLink).filter((l) => !isDriveFolderUrl(l)),
  )

  useEffect(() => {
    let cancelled = false
    const direct = parseDesignLinks(designLink)

    // Show non-folder links right away while folders resolve
    setUrls(direct.filter((l) => !isDriveFolderUrl(l)))

    if (direct.some(isDriveFolderUrl)) {
      resolveDesignUrls(designLink)
        .then((resolved) => {
          if (!cancelled) setUrls(resolved)
        })
        .catch((error) => {
          console.error("[useDesignLinks] Failed to resolve design links:", error)
        })
    }

    return () => {
      cancelled = true
    }
  }, [designLink, imageEpoch])

  return urls
}
