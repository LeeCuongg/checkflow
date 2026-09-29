"use client"

import { ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { LazyImage } from "@/components/ui/lazy-image"

// Large view of one photo from the Base Templates list. Drive links render through the
// /api/drive-image proxy inside LazyImage; "Mở tab mới" opens the ORIGINAL link.
export function ImagePopup({
  url,
  label,
  linkUrl,
  onClose,
}: {
  url: string | null
  label?: string
  // What "Mở tab mới" opens when it differs from the shown file (e.g. the Drive folder).
  linkUrl?: string
  onClose: () => void
}) {
  return (
    <Dialog open={!!url} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-5xl w-[92vw] p-3"
        // Keys pressed here must not reach the page's shortcuts (Enter opens the review).
        onKeyDown={(e) => e.stopPropagation()}
      >
        <DialogTitle className="text-sm font-medium text-gray-700 pr-8 truncate">{label || "Ảnh"}</DialogTitle>
        {url && (
          <div className="flex flex-col gap-3">
            <div className="w-full h-[75vh] bg-gray-50 rounded border border-gray-200 overflow-hidden">
              <LazyImage
                src={url}
                alt={label || "Ảnh"}
                className="w-full h-full"
                fit="contain"
                fallbackSrc="/placeholder.svg?height=400&width=400&text=Image"
              />
            </div>
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(linkUrl || url, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Mở tab mới
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
