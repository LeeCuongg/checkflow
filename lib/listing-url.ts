// Build the storefront listing URL for an order (port of Mera's listingSearchUrl + Amazon).
//
// Per-channel shapes:
//   amazon  → first URL found in the item's Source Link (free text in Mera)
//   shopify → https://<shop_id>.myshopify.com/search?type=product&q=<product_name>
//   etsy / manual / empty (sheet data) → https://www.etsy.com/shop/<store>?search_query=<product_name>
//
// Returns null when no reliable URL can be built — callers render plain text instead.
export function listingUrl(input: {
  channel?: string
  store?: string
  shopId?: string
  sourceLink?: string
  productName?: string
}): string | null {
  const channel = (input.channel ?? "").trim().toLowerCase()

  if (channel === "amazon") {
    const match = (input.sourceLink ?? "").match(/https?:\/\/[^\s<>"']+/i)
    return match ? match[0] : null
  }

  const name = (input.productName ?? "").trim()
  if (!name) return null

  if (channel === "shopify") {
    const shopId = (input.shopId ?? "").trim()
    if (!shopId) return null
    return `https://${shopId}.myshopify.com/search?type=product&q=${encodeURIComponent(name)}`
  }

  const store = (input.store ?? "").trim()
  if (!store) return null
  return `https://www.etsy.com/shop/${encodeURIComponent(store)}?search_query=${encodeURIComponent(name)}`
}

export function listingUrlTitle(channel?: string): string {
  switch ((channel ?? "").trim().toLowerCase()) {
    case "amazon":
      return "Open listing on Amazon"
    case "shopify":
      return "Search product on Shopify store"
    default:
      return "Search product on Etsy shop"
  }
}
