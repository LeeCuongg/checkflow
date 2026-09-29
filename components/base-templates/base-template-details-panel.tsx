"use client"

import { ExternalLink, FileText, Clock, User, LinkIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { LazyImage } from "@/components/ui/lazy-image"
import { ProductTypeNoteSection } from "@/components/review/product-type-note-section"
import { listingUrl, listingUrlTitle } from "@/lib/listing-url"
import { formatDate } from "@/utils/format-utils"
import type { ProductTypeNoteResponse } from "@/types/order-review"
import type { BaseTemplateProductType, BaseTemplateVariant } from "@/types/mera-base-template"
import type { SampleOrderState } from "@/hooks/use-base-template-sample-order"
import type { PendingOrdersState } from "@/hooks/use-base-template-pending-orders"
import { PendingOrdersSection } from "./pending-orders-section"
import { countriesLabel, statusLabel } from "./utils"

// Status pill in the same style as the order review screen (dot + colored badge).
export function BaseTemplateStatusBadge({ status }: { status: string }) {
  const s = (status || "").trim().toUpperCase()
  const style =
    s === "CONFIRMED"
      ? { badge: "bg-green-50 text-green-700 border-green-200", dot: "bg-green-500" }
      : s === "NEED REPAIR"
        ? { badge: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500" }
        : s === "REPAIRED"
          ? { badge: "bg-purple-50 text-purple-700 border-purple-200", dot: "bg-purple-500" }
          : { badge: "bg-gray-100 text-gray-700 border-gray-200", dot: "bg-gray-400" }
  return (
    <Badge className={style.badge}>
      <div className={`w-2 h-2 ${style.dot} rounded-full mr-2`}></div>
      {statusLabel(s)}
    </Badge>
  )
}

interface BaseTemplateDetailsPanelProps {
  pt: BaseTemplateProductType
  variant: BaseTemplateVariant
  sample: SampleOrderState
  pendingOrders: PendingOrdersState
  productTypeNoteData: ProductTypeNoteResponse | null
  productTypeNoteLoading: boolean
  productTypeNoteError: string | null
  refetchProductTypeNote: () => void
  getCachedImageUrl: (url: string | null | undefined) => string | null
  // The product type's own photos (Mera `image_links` on the product type). Empty = hidden.
  productTypeImages: string[]
  activeImageUrl?: string
  // Click = show it large in the image viewer (Product tab).
  onShowImage: (url: string) => void
  // Photo of a waiting order (product / customer): shown large in the Product tab too.
  onShowOrderImage: (url: string, label: string, source: "order" | "customer") => void
}

// Right column of the base template review modal — laid out like OrderDetailsPanel:
// Details → waiting orders → Mockup & Design Links → Note for <product type> (shared component, same note
// as the order review screen) → history (like "Order History").
export function BaseTemplateDetailsPanel({
  pt,
  variant,
  sample,
  pendingOrders,
  productTypeNoteData,
  productTypeNoteLoading,
  productTypeNoteError,
  refetchProductTypeNote,
  getCachedImageUrl,
  productTypeImages,
  activeImageUrl,
  onShowImage,
  onShowOrderImage,
}: BaseTemplateDetailsPanelProps) {
  const sampleOrder = sample.order
  const storeListingUrl = sampleOrder ? listingUrl(sampleOrder) : null
  const history = [...(variant.history ?? [])].sort((a, b) => (b.at || "").localeCompare(a.at || ""))

  return (
    <>
      {/* Template Details */}
      <div className="border-b border-gray-200">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-900">Template Details</h3>
          </div>
          <div className="grid grid-cols-1 gap-3 text-xs">
            <div>
              <span className="text-gray-600">Designer:</span>{" "}
              <span className="font-medium">{variant.designer || "N/A"}</span>
            </div>
            <div>
              <span className="text-gray-600">Status:</span>{" "}
              <span className="font-medium">
                <BaseTemplateStatusBadge status={variant.base_template_status} />
              </span>
            </div>
            <div>
              <span className="text-gray-600">Project:</span>{" "}
              <span className="font-medium">{pt.project_name || pt.project_id || "N/A"}</span>
            </div>
            <div>
              <span className="text-gray-600">Store:</span>{" "}
              {sample.loading ? (
                <span className="text-gray-500">Loading...</span>
              ) : sampleOrder?.store && storeListingUrl ? (
                <a
                  href={storeListingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={listingUrlTitle(sampleOrder)}
                  className="font-medium text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
                >
                  {sampleOrder.store}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : sampleOrder?.store ? (
                <span className="font-medium">{sampleOrder.store}</span>
              ) : (
                <span className="font-medium">N/A</span>
              )}
              {sample.error && (
                <span className="block text-[11px] text-gray-400" title={sample.error}>
                  Không tải được đơn mẫu
                </span>
              )}
            </div>
            {sampleOrder?.country && (
              <div>
                <span className="text-gray-600">Country:</span>{" "}
                <span className="font-medium">{sampleOrder.country}</span>
              </div>
            )}
            <div>
              <span className="text-gray-600">Countries (variant):</span>{" "}
              <span className="font-medium">{countriesLabel(variant)}</span>
            </div>
            <div>
              <span className="text-gray-600">Product type:</span>{" "}
              <span className="font-medium break-all">{pt.slug}</span>
            </div>
            <div>
              <span className="text-gray-600">Đơn chờ:</span>{" "}
              <span className="font-medium">{variant.pending_count ?? 0}</span>
              {sample.sampleItemKey && (
                <span className="text-gray-500"> · đơn mẫu {sample.sampleItemKey}</span>
              )}
            </div>
          </div>

          {productTypeImages.length > 0 && (
            <div className="mt-3">
              <div className="text-xs text-gray-600 mb-1.5">
                Ảnh product type ({productTypeImages.length}) — bấm để xem lớn
              </div>
              <div className="grid grid-cols-4 gap-2">
                {productTypeImages.map((url) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => onShowImage(url)}
                    className={`aspect-square rounded border-2 overflow-hidden bg-white ${
                      activeImageUrl === url ? "border-blue-500" : "border-gray-200 hover:border-gray-400"
                    }`}
                    title="Ảnh product type — bấm để xem lớn"
                  >
                    <LazyImage
                      src={getCachedImageUrl(url) || url}
                      alt="Ảnh product type"
                      className="w-full h-full"
                      fit="cover"
                      previewSize={400}
                      fullSize={400}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Waiting orders of this variant — check them directly before approving */}
      <PendingOrdersSection
        state={pendingOrders}
        pendingCount={variant.pending_count ?? 0}
        getCachedImageUrl={getCachedImageUrl}
        activeImageUrl={activeImageUrl}
        onShowImage={onShowOrderImage}
      />

      {/* Mockup & Design Links (read-only: the template is edited in Mera) */}
      <div className="border-b border-gray-200">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <LinkIcon className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900">Mockup & Design Links</h3>
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-xs font-medium text-gray-700 mb-1">Mockup</div>
              {variant.base_template_mockup ? (
                <a
                  href={variant.base_template_mockup}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1 break-all"
                >
                  {variant.base_template_mockup}
                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                </a>
              ) : (
                <span className="text-xs text-gray-500 italic">No mockup link</span>
              )}
            </div>
            <div>
              <div className="text-xs font-medium text-gray-700 mb-1">Design</div>
              {variant.base_template_design ? (
                <a
                  href={variant.base_template_design}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1 break-all"
                >
                  {variant.base_template_design}
                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                </a>
              ) : (
                <span className="text-xs text-gray-500 italic">No design link</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Product Type Note — same note (key = product type slug) as the order review screen */}
      <ProductTypeNoteSection
        productType={pt.slug}
        productTypeNoteData={productTypeNoteData}
        productTypeNoteLoading={productTypeNoteLoading}
        productTypeNoteError={productTypeNoteError}
        refetchProductTypeNote={refetchProductTypeNote}
        getCachedImageUrl={getCachedImageUrl}
      />

      {/* Base Template History */}
      <div className="border-b border-gray-200">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-900">Base Template History</h3>
          </div>

          {history.length ? (
            <div className="space-y-3">
              {history.map((entry, index) => {
                const prevEntry = history[index + 1]
                return (
                  <div key={`${entry.at}-${index}`} className="border-l-2 border-gray-200 pl-3 pb-3">
                    <div className="text-xs text-gray-600 mb-1">{entry.at ? formatDate(entry.at) : "—"}</div>
                    <div className="text-xs font-medium text-gray-900 mb-1">
                      {prevEntry ? `${statusLabel(prevEntry.status)} → ` : ""}
                      {statusLabel(entry.status)}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-600 mb-1">
                      <User className="h-3 w-3" />
                      <span>{entry.actor_email || "N/A"}</span>
                    </div>
                    {entry.note && (
                      <div className="text-xs text-gray-700 bg-gray-50 p-2 rounded whitespace-pre-wrap">
                        "{entry.note}"
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-xs text-gray-500">No base template history available</div>
          )}
        </div>
      </div>
    </>
  )
}
