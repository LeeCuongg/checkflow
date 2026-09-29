"use client"

import { useEffect, useRef, useState } from "react"
import { LazyImage } from "@/components/ui/lazy-image"
import { parseDesignLinks, resolveDesignUrls } from "@/utils/design-links"
import { useImageEpoch } from "@/hooks/use-image-refresh"

type Tile = { key: string; label: string; url?: string; loading?: boolean; linkUrl?: string }

// First viewable file of a design/mockup link (a Drive folder resolves to its files; the
// resolver caches per link). Idle until `enabled`.
function useFirstFile(raw: string | undefined, enabled: boolean): { url?: string; loading: boolean } {
  const imageEpoch = useImageEpoch()
  const [state, setState] = useState<{ url?: string; loading: boolean }>({ loading: false })
  useEffect(() => {
    if (!enabled || parseDesignLinks(raw).length === 0) {
      setState({ loading: false })
      return
    }
    let cancelled = false
    setState({ loading: true })
    resolveDesignUrls(raw)
      .then((urls) => !cancelled && setState({ url: urls[0], loading: false }))
      .catch(() => !cancelled && setState({ loading: false }))
    return () => {
      cancelled = true
    }
  }, [raw, enabled, imageEpoch])
  return state
}

// Three previews side by side — Product (real order photo), Design, Mockup — like the order
// list on /review. Design/mockup links may be Drive FOLDERS; those are expanded through the
// Drive API (cached per link), and only once the row scrolls into view so a long list does
// not fire one listing per row on load.
export function PreviewStrip({
  productImage,
  designLink,
  mockupLink,
  onOpen,
}: {
  productImage?: string
  designLink?: string
  mockupLink?: string
  // linkUrl = the original design/mockup link (may be a Drive folder) for "Mở tab mới".
  onOpen: (url: string, label: string, linkUrl?: string) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = boxRef.current
    if (!el || inView) return
    if (typeof IntersectionObserver === "undefined") {
      setInView(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true)
          io.disconnect()
        }
      },
      { rootMargin: "200px" }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [inView])

  const design = useFirstFile(designLink, inView)
  const mockup = useFirstFile(mockupLink, inView)

  const tiles: Tile[] = [
    { key: "product", label: "Product", url: productImage },
    { key: "design", label: "Design", linkUrl: designLink, url: design.url, loading: design.loading || (!inView && !!designLink) },
    { key: "mockup", label: "Mockup", linkUrl: mockupLink, url: mockup.url, loading: mockup.loading || (!inView && !!mockupLink) },
  ]

  return (
    // Inline grid: three columns side by side no matter which utility classes the build emitted.
    <div
      ref={boxRef}
      className="gap-2 w-full"
      style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}
    >
      {tiles.map((t) =>
        t.url ? (
          <div
            key={t.key}
            className="relative cursor-zoom-in"
            onClick={(e) => {
              e.stopPropagation()
              onOpen(t.url!, t.label, t.linkUrl)
            }}
          >
            <LazyImage
              src={t.url}
              alt={t.label}
              className="w-full h-20 rounded-lg border border-gray-200 hover:border-gray-300"
              fallbackSrc={`/placeholder.svg?height=80&width=80&text=${t.label}`}
            />
            <span className="absolute bottom-1 left-1 text-xs bg-black bg-opacity-75 text-white px-1.5 py-0.5 rounded">
              {t.label}
            </span>
          </div>
        ) : (
          <div
            key={t.key}
            className="h-20 rounded-lg border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center text-xs text-gray-400"
          >
            {t.loading ? "Đang tải…" : `Không có ${t.label}`}
          </div>
        )
      )}
    </div>
  )
}
