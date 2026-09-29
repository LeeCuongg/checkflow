"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { LazyImage } from "@/components/ui/lazy-image"
import { ExternalLink, FileText, Edit2, Check, X, Lightbulb } from "lucide-react"
import type { ProductTypeNoteResponse } from "@/types/order-review"
import { extractImageUrls } from "@/utils/image-utils"

interface ProductTypeNoteSectionProps {
  // Key of the note (`product_type_notes.product_type`). Empty = render nothing; the
  // component stays mounted so an in-progress edit survives items without a product type.
  productType: string | undefined
  productTypeNoteData: ProductTypeNoteResponse | null
  productTypeNoteLoading: boolean
  productTypeNoteError: string | null
  refetchProductTypeNote: () => void
  getCachedImageUrl: (url: string | null | undefined) => string | null
}

// "Note for <product type>" block — view / edit / save the shared per-product-type note
// (GET/POST /api/product-type-notes/:productType). Used by the order review details panel
// and the base template review modal, so both screens read and write the same note.
export function ProductTypeNoteSection({
  productType,
  productTypeNoteData,
  productTypeNoteLoading,
  productTypeNoteError,
  refetchProductTypeNote,
  getCachedImageUrl,
}: ProductTypeNoteSectionProps) {
  const [productTypeNote, setProductTypeNote] = useState("")
  const [isEditingProductNote, setIsEditingProductNote] = useState(false)
  const [productNoteLoading, setProductNoteLoading] = useState(false)

  useEffect(() => {
    if (productTypeNoteData?.data?.content) {
      setProductTypeNote(productTypeNoteData.data.content)
    } else {
      setProductTypeNote("")
    }
  }, [productTypeNoteData])

  const handleOpenAllImages = () => {
    const imageUrls = extractImageUrls(productTypeNote)
    imageUrls.forEach((url) => {
      window.open(url, "_blank")
    })
  }

  const renderNoteContent = (content: string) => {
    if (!content) return null

    const urlRegex = /(https?:\/\/[^\s]+)/g
    const parts = content.split(urlRegex)

    return (
      <div className="space-y-2">
        {parts.map((part, index) => {
          if (urlRegex.test(part)) {
            const isImage = /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(part)
            if (isImage) {
              return (
                <div key={index} className="w-full">
                  <LazyImage
                    src={getCachedImageUrl(part) || part}
                    alt="Product type note image"
                    className="w-full h-auto object-contain rounded border border-gray-200 cursor-pointer"
                    fit="contain"
                    onClick={() => window.open(part, "_blank")}
                    fallbackSrc="/placeholder.svg?height=200&width=300&text=Image"
                  />
                </div>
              )
            } else {
              return (
                <a
                  key={index}
                  href={part}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 hover:underline text-xs break-all"
                >
                  {part}
                </a>
              )
            }
          } else {
            return part ? (
              <p key={index} className="text-xs text-gray-700 whitespace-pre-wrap">
                {part}
              </p>
            ) : null
          }
        })}
      </div>
    )
  }

  const handleSaveProductNote = async () => {
    if (!productType) return

    setProductNoteLoading(true)
    try {
      const token = localStorage.getItem("auth-token")
      const response = await fetch(`/api/product-type-notes/${encodeURIComponent(productType)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: productTypeNote,
        }),
      })

      if (response.ok) {
        setIsEditingProductNote(false)
        refetchProductTypeNote()
      } else {
        console.error("Failed to save product type note")
      }
    } catch (error) {
      console.error("Error saving product type note:", error)
    } finally {
      setProductNoteLoading(false)
    }
  }

  const handleCancelEditProductNote = () => {
    setProductTypeNote(productTypeNoteData?.data?.content || "")
    setIsEditingProductNote(false)
  }

  if (!productType) return null

  return (
    <div className="border-b border-gray-200">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-orange-600" />
            <h3 className="text-sm font-semibold text-gray-900">Note for {productType}</h3>
          </div>
          <div className="flex gap-1">
            {!isEditingProductNote && extractImageUrls(productTypeNote).length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleOpenAllImages}
                className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                title="Open all images in new tabs"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
            {!isEditingProductNote ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditingProductNote(true)}
                className="h-7 w-7 p-0 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
                title="Edit product type note"
              >
                <Edit2 className="h-4 w-4" />
              </Button>
            ) : (
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSaveProductNote}
                  disabled={productNoteLoading}
                  className="h-7 w-7 p-0 text-green-600 hover:bg-green-50 hover:text-green-700"
                  title="Save note"
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelEditProductNote}
                  disabled={productNoteLoading}
                  className="h-7 w-7 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                  title="Cancel"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {productTypeNoteLoading ? (
          <div className="text-xs text-gray-500">Loading note...</div>
        ) : productTypeNoteError ? (
          <div className="text-xs text-red-600">Error loading note</div>
        ) : isEditingProductNote ? (
          <div className="space-y-3">
            <Textarea
              value={productTypeNote}
              onChange={(e) => setProductTypeNote(e.target.value)}
              placeholder="Add notes for this product type. You can include text and image URLs..."
              rows={6}
              className="text-xs border-gray-200 focus:border-orange-300 focus:ring-orange-200"
            />
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Lightbulb className="h-3 w-3" />
              <span>Tip: Paste image URLs (jpg, png, gif, webp) and they will be displayed automatically</span>
            </div>
          </div>
        ) : (
          <div className="min-h-[60px] bg-orange-50 rounded-md p-3 border border-orange-100">
            {productTypeNote ? (
              renderNoteContent(productTypeNote)
            ) : (
              <div className="text-xs text-gray-500 italic">
                No notes available for this product type. Click Edit to add notes.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
