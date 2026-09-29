// Build the storefront listing URL for an order (port of Mera's listingSearchUrl + Amazon).
//
// Amazon orders are NOT tagged channel=amazon in Mera — they come in as "manual" — so the
// order is recognised by its Source Link (free text on the item that holds the Amazon listing
// URL), falling back to channel "amazon" or a store name that says AMZ/Amazon.
//
// Per-kind shapes:
//   amazon  → the Amazon URL found in the item's Source Link (never an Etsy search)
//   shopify → https://<shop_id>.myshopify.com/search?type=product&q=<product_name>
//   etsy / manual / empty (sheet data) → https://www.etsy.com/shop/<store>?search_query=<product_name>
//
// Returns null when no reliable URL can be built — callers render plain text instead.

export interface ListingInput {
  channel?: string
  store?: string
  shopId?: string
  sourceLink?: string
  productName?: string
}

const URL_RE = /https?:\/\/[^\s<>"']+/gi
const AMAZON_HOST_RE = /^https?:\/\/([a-z0-9-]+\.)*(amazon\.[a-z.]+|amzn\.[a-z.]+|a\.co)(\/|$)/i

// First Amazon URL inside a free-text Source Link.
export function amazonUrlIn(sourceLink?: string): string | null {
  for (const url of (sourceLink ?? "").match(URL_RE) ?? []) {
    if (AMAZON_HOST_RE.test(url)) return url
  }
  return null
}

export function isAmazonOrder(input: ListingInput): boolean {
  if ((input.channel ?? "").trim().toLowerCase() === "amazon") return true
  if (amazonUrlIn(input.sourceLink)) return true
  return /\b(amz|amazon)\b/i.test(input.store ?? "")
}

export function listingUrl(input: ListingInput): string | null {
  const channel = (input.channel ?? "").trim().toLowerCase()

  const amazon = amazonUrlIn(input.sourceLink)
  if (amazon) return amazon
  if (isAmazonOrder(input)) {
    // channel=amazon with a non-Amazon URL in Source Link: still the best link we have.
    const any = (input.sourceLink ?? "").match(URL_RE)
    return channel === "amazon" && any ? any[0] : null
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

// Tooltip for the listing link. Accepts the order (preferred: an Amazon order is only known
// from its Source Link) or, for older callers, just the channel.
export function listingUrlTitle(input?: string | ListingInput): string {
  const order: ListingInput = typeof input === "string" || input === undefined ? { channel: input } : input
  if (isAmazonOrder(order)) return "Open listing on Amazon"
  switch ((order.channel ?? "").trim().toLowerCase()) {
    case "shopify":
      return "Search product on Shopify store"
    default:
      return "Search product on Etsy shop"
  }
}
