"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { LazyImage } from "@/components/ui/lazy-image"
import { ExternalLink, User, Calendar, Store, Package, Copy, CheckCheck } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import type { Order } from "@/types/order"
import { listingUrl, listingUrlTitle } from "@/lib/listing-url"

interface OrderListItemProps {
  order: Order
}

export function OrderListItem({ order }: OrderListItemProps) {
  const [copiedItemId, setCopiedItemId] = useState(false)

  const getStatusBadge = (status: Order["status"]) => {
    switch (status) {
      case "NEW":
        return (
          <Badge className="bg-green-50 text-green-700 border-green-200 hover:bg-green-50 font-medium">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
            New
          </Badge>
        )
      case "DESIGNED":
        return (
          <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50 font-medium">
            <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
            Designed
          </Badge>
        )
      case "NEED REPAIR":
        return (
          <Badge className="bg-red-50 text-red-700 border-red-200 hover:bg-red-50 font-medium">
            <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
            Need Repair
          </Badge>
        )
      case "REPAIRED":
        return (
          <Badge className="bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-50 font-medium">
            <div className="w-2 h-2 bg-purple-500 rounded-full mr-2"></div>
            Repaired
          </Badge>
        )
      case "CONFIRMED":
        return (
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50 font-medium">
            <div className="w-2 h-2 bg-emerald-500 rounded-full mr-2"></div>
            Confirmed
          </Badge>
        )
      default:
        return (
          <Badge variant="secondary" className="font-medium">
            <div className="w-2 h-2 bg-gray-400 rounded-full mr-2"></div>
            {status}
          </Badge>
        )
    }
  }

  const truncateText = (text: string | undefined, maxLength: number) => {
    if (!text) return ""
    return text.length > maxLength ? text.substring(0, maxLength) + "..." : text
  }

  const formatTimeAgo = (dateString: string | undefined) => {
    if (!dateString) return ""
    try {
      const date = new Date(dateString)
      return formatDistanceToNow(date, { addSuffix: true })
    } catch {
      return dateString
    }
  }

  const handleCopyItemId = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    try {
      await navigator.clipboard.writeText(order.itemId)
      setCopiedItemId(true)
      setTimeout(() => setCopiedItemId(false), 2000)
    } catch (error) {
      console.error("Failed to copy item ID:", error)
    }
  }

  const productListingUrl = listingUrl({
    ...order,
    productName: order.productName?.replace(/\s+/g, " "),
  })
  const isEtsyChannel = !["amazon", "shopify"].includes((order.channel ?? "").toLowerCase())

  const handleStoreClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const storeUrl = isEtsyChannel && order.store ? `https://etsy.com/shop/${order.store}` : productListingUrl
    if (storeUrl) {
      window.open(storeUrl, "_blank", "noopener,noreferrer")
    }
  }

  const handleProductClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (productListingUrl) {
      window.open(productListingUrl, "_blank", "noopener,noreferrer")
    }
  }

  const getMockupImageUrl = () => {
    if (order.mockup) {
      // Return original URL - cache system will handle Google Drive links
      return order.mockup
    }
    // If no mockup field value, use the find service
    return `https://go.pamoteam.top/mockup/find?itemId=${order.itemId}`
  }

  return (
    <Card className="group hover:shadow-lg transition-all duration-200 border-gray-200 hover:border-gray-300">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 text-lg">#{order.itemId}</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyItemId}
                className="h-6 w-6 p-0 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Copy Item ID"
              >
                {copiedItemId ? (
                  <CheckCheck className="h-3 w-3 text-green-600" />
                ) : (
                  <Copy className="h-3 w-3 text-gray-500" />
                )}
              </Button>
            </div>
            {getStatusBadge(order.status)}
            {order.designer && (
              <Badge variant="outline" className="text-xs bg-gray-50 text-gray-600 border-gray-200">
                <User className="w-3 h-3 mr-1" />
                {order.designer}
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Order Details */}
          <div className="lg:col-span-2 space-y-4">
            {/* Personalization - Highest Priority */}
            {order.personalization && (
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-sm font-semibold text-blue-900">Personalization</span>
                </div>
                <p className="text-sm text-blue-800 leading-relaxed whitespace-pre-wrap">
                  {truncateText(order.personalization, 200)}
                </p>
              </div>
            )}

            {/* Order Note */}
            {order.orderNote && (
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                  <span className="text-sm font-semibold text-gray-700">Order Note</span>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{truncateText(order.orderNote, 150)}</p>
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              {/* Keep the old mockupLink for backward compatibility if it exists and is different from mockup */}
              {order.mockupLink && order.mockupLink !== order.mockup && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(order.mockupLink, "_blank")}
                  className="h-7 px-2 text-xs bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
                >
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Mockup Link
                </Button>
              )}
            </div>

            {/* Product & Meta Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              {order.productName && (
                <div className="flex items-start gap-2">
                  <Package className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium text-gray-700">Product:</span>
                    <p
                      className="text-gray-600 mt-1 cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                      onClick={handleProductClick}
                      title={listingUrlTitle(order.channel)}
                    >
                      {truncateText(order.productName, 60)}
                      <ExternalLink className="w-3 h-3 inline ml-1" />
                    </p>
                  </div>
                </div>
              )}

              {order.store && (
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-gray-700">Store:</span>
                  <span
                    className="text-gray-600 cursor-pointer hover:text-blue-600 hover:underline transition-colors flex items-center gap-1"
                    onClick={handleStoreClick}
                    title={isEtsyChannel ? "Click to open store on Etsy" : listingUrlTitle(order.channel)}
                  >
                    {order.store}
                    <ExternalLink className="w-3 h-3" />
                  </span>
                </div>
              )}

              {order.date && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-gray-700">Date:</span>
                  <span className="text-gray-600" title={new Date(order.date).toLocaleDateString()}>
                    {formatTimeAgo(order.date)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right: Images */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Images</h4>

            <div className="flex gap-2 mb-3">
              {order.designLink && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(order.designLink, "_blank")}
                  className="h-7 px-2 text-xs bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                >
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Design
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const mockupUrl = order.mockup || `https://go.pamoteam.top/mockup/find?itemId=${order.itemId}`
                  window.open(mockupUrl, "_blank")
                }}
                className="h-7 px-2 text-xs bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100"
              >
                <ExternalLink className="w-3 h-3 mr-1" />
                Mockup
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {order.productImage && (
                <div className="group/img relative">
                  <LazyImage
                    src={order.productImage}
                    alt="Product"
                    className="w-full h-20 rounded-lg border border-gray-200 group-hover/img:border-gray-300 transition-colors cursor-pointer"
                    fallbackSrc="/placeholder.svg?height=80&width=80&text=Product"
                    onClick={() => window.open(order.productImage, "_blank")}
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover/img:bg-opacity-20 rounded-lg transition-all duration-200 flex items-center justify-center">
                    <ExternalLink className="h-4 w-4 text-white opacity-0 group-hover/img:opacity-100 transition-opacity" />
                  </div>
                  <span className="absolute bottom-1 left-1 text-xs bg-black bg-opacity-75 text-white px-1.5 py-0.5 rounded">
                    Product
                  </span>
                </div>
              )}

              {order.customerImage && (
                <div className="group/img relative">
                  <LazyImage
                    src={order.customerImage}
                    alt="Customer Reference"
                    className="w-full h-20 rounded-lg border border-gray-200 group-hover/img:border-gray-300 transition-colors cursor-pointer"
                    fallbackSrc="/placeholder.svg?height=80&width=80&text=Customer"
                    onClick={() => window.open(order.customerImage, "_blank")}
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover/img:bg-opacity-20 rounded-lg transition-all duration-200 flex items-center justify-center">
                    <ExternalLink className="h-4 w-4 text-white opacity-0 group-hover/img:opacity-100 transition-opacity" />
                  </div>
                  <span className="absolute bottom-1 left-1 text-xs bg-black bg-opacity-75 text-white px-1.5 py-0.5 rounded">
                    Customer
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
