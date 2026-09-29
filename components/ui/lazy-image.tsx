"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { cn } from "@/lib/utils"
import {
  FULL_SIZE,
  PREVIEW_SIZE,
  clearImageToken,
  extractDriveFileId,
  getImageToken,
  isDriveUrl,
  peekDriveImageUrl,
} from "@/lib/drive-image"
import { useImageEpoch } from "@/hooks/use-image-refresh"

interface LazyImageProps {
  src: string
  alt: string
  className?: string
  style?: CSSProperties
  fallbackSrc?: string
  placeholder?: string
  draggable?: boolean
  fit?: "cover" | "contain"
  /** Skip the viewport check and start loading immediately (for images known to be visible). */
  eager?: boolean
  /** Width of the cheap preview shown while the larger render downloads. */
  previewSize?: number
  /** Width of the final render shown once it has loaded. */
  fullSize?: number
  onLoad?: () => void
  onError?: () => void
  onClick?: () => void
}

const MAX_RETRIES = 2

export function LazyImage({
  src,
  alt,
  className,
  style,
  fallbackSrc = "/placeholder.svg?height=48&width=48&text=Image",
  placeholder = "/placeholder.svg?height=48&width=48&text=Loading",
  draggable,
  fit = "cover",
  eager = false,
  previewSize = PREVIEW_SIZE,
  fullSize = FULL_SIZE,
  onLoad,
  onError,
  onClick,
}: LazyImageProps) {
  const [isInView, setIsInView] = useState(eager)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [fullSrc, setFullSrc] = useState<string | null>(null)
  const [isFullReady, setIsFullReady] = useState(false)
  const [isDisplayLoaded, setIsDisplayLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)
  const imageEpoch = useImageEpoch()

  const containerRef = useRef<HTMLDivElement>(null)
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSrcRef = useRef<string | null>(null)

  // A different image means a fresh retry budget.
  if (lastSrcRef.current !== src) {
    lastSrcRef.current = src
    retryCountRef.current = 0
  }

  useEffect(() => {
    if (eager) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          observer.disconnect()
        }
      },
      // Start fetching before the image scrolls into view, and use threshold 0 so a
      // container that has not been laid out yet still triggers.
      { threshold: 0, rootMargin: "600px" },
    )

    if (containerRef.current) observer.observe(containerRef.current)

    return () => observer.disconnect()
  }, [eager])

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
  }, [])

  // Resolve `src` into the URLs we actually render. Reset and resolve live in the same
  // effect so a stale flag can never suppress the fetch for a newly assigned src.
  useEffect(() => {
    let cancelled = false

    setIsFullReady(false)
    setIsDisplayLoaded(false)
    setHasError(false)
    setPreviewSrc(null)
    setFullSrc(null)

    if (!src || !isInView) return

    if (!isDriveUrl(src)) {
      const bust = [reloadNonce > 0 ? `r=${reloadNonce}` : "", imageEpoch > 0 ? `v=${imageEpoch}` : ""]
        .filter(Boolean)
        .join("&")
      setFullSrc(bust ? `${src}${src.includes("?") ? "&" : "?"}${bust}` : src)
      return
    }

    // A Drive link we cannot turn into a file id (a folder link, say) is not displayable.
    if (!extractDriveFileId(src)) {
      setHasError(true)
      onError?.()
      return
    }

    const resolve = async () => {
      try {
        // Ensures the token exists so both URLs can be built synchronously below.
        await getImageToken()
        if (cancelled) return

        const preview = peekDriveImageUrl(src, { size: previewSize, attempt: reloadNonce })
        const full = peekDriveImageUrl(src, { size: fullSize, attempt: reloadNonce })
        if (!full) throw new Error("Could not build a Drive image URL")

        setPreviewSrc(preview)
        setFullSrc(full)
      } catch (error) {
        console.error("[LazyImage] Failed to prepare Drive image URL:", error)
        if (!cancelled) {
          setHasError(true)
          onError?.()
        }
      }
    }

    resolve()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, isInView, reloadNonce, previewSize, fullSize, imageEpoch])

  const scheduleRetry = () => {
    if (retryCountRef.current >= MAX_RETRIES) return false

    retryCountRef.current += 1
    const attempt = retryCountRef.current

    retryTimerRef.current = setTimeout(() => {
      // A repeat failure is most often an expired image token — drop it and re-mint.
      if (attempt > 1) clearImageToken()
      setReloadNonce((n) => n + 1)
    }, 400 * attempt)

    return true
  }

  const failPermanently = () => {
    setHasError(true)
    onError?.()
  }

  // Load the original off-screen so the preview stays on screen until it is ready —
  // swapping to an already-decoded image avoids any flash.
  useEffect(() => {
    if (!isInView || !fullSrc) return

    if (!previewSrc) {
      setIsFullReady(true)
      return
    }

    let cancelled = false
    const loader = new Image()

    loader.onload = () => {
      if (!cancelled) setIsFullReady(true)
    }
    loader.onerror = () => {
      if (cancelled) return
      if (!scheduleRetry()) failPermanently()
    }
    loader.src = fullSrc

    return () => {
      cancelled = true
      loader.onload = null
      loader.onerror = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullSrc, previewSrc, isInView])

  const handleManualRetry = () => {
    retryCountRef.current = 0
    clearImageToken()
    setReloadNonce((n) => n + 1)
  }

  const handleVisibleError = () => {
    // The preview failed (some Drive files have no thumbnail) — fall through to the original.
    if (previewSrc && !isFullReady) {
      setPreviewSrc(null)
      return
    }
    if (!scheduleRetry()) failPermanently()
  }

  const displaySrc = hasError ? fallbackSrc : isFullReady || !previewSrc ? fullSrc : previewSrc
  const isShowingPreview = !hasError && !!previewSrc && !isFullReady
  const showPlaceholder = !hasError && (!isInView || !displaySrc || !isDisplayLoaded)

  return (
    <div ref={containerRef} className={cn("relative overflow-hidden", className)} onClick={onClick}>
      {showPlaceholder && (
        <img
          src={placeholder || "/placeholder.svg"}
          alt="Loading..."
          className={cn("w-full h-full object-cover opacity-50", displaySrc && "absolute inset-0")}
        />
      )}

      {displaySrc && (
        <img
          src={displaySrc}
          alt={alt}
          className={cn(
            "w-full h-full transition-opacity duration-300",
            fit === "contain" ? "object-contain" : "object-cover",
            isDisplayLoaded ? "opacity-100" : "opacity-0",
          )}
          style={style}
          draggable={draggable}
          onLoad={() => {
            setIsDisplayLoaded(true)
            onLoad?.()
          }}
          onError={handleVisibleError}
        />
      )}

      {isShowingPreview && isDisplayLoaded && (
        <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          Preview…
        </span>
      )}

      {hasError && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            handleManualRetry()
          }}
          className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-black/85"
        >
          Tải lại
        </button>
      )}
    </div>
  )
}
