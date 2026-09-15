import type { Order } from "@/types/order"
import type { MeraOrder, MeraOrderItem } from "@/types/mera-order"

// Mera status → CheckFlow display status
// CheckFlow status set is a subset; unmapped statuses pass through as-is
const STATUS_MAP: Record<string, Order["status"]> = {
  DESIGNING: "DESIGNING",
  CONFIRMED: "CONFIRMED",
  NEED_REPAIR: "NEED REPAIR",
  "NEED REPAIR": "NEED REPAIR",
  REPAIRED: "REPAIRED",
  DESIGNED: "DESIGNED",
}

function mapStatus(meraStatus: string): Order["status"] {
  return STATUS_MAP[meraStatus] ?? (meraStatus as Order["status"])
}

function adaptMeraOrderWithItem(order: MeraOrder, item: MeraOrderItem): Order & { _mera: MeraOrder } {
  return {
    itemId: item.item_key,
    sheetId: "__mera__",
    status: mapStatus(item.status),
    orderNote: item.note || order.note || undefined,
    designer: item.designer?.name || order.designer?.name || undefined,
    designLink: item.design_link || undefined,
    mockup: item.mockup_link || order.mockup_link || undefined,
    customerImage: item.customer_image || undefined,
    personalization: item.personalization || undefined,
    date: order.created_at,
    store: order.store || undefined,
    productImage: item.image_link || undefined,
    productType: item.product_type || undefined,
    productName: item.product_name || undefined,
    country: order.shipping?.country || undefined,
    channel: order.channel || undefined,
    shopId: order.shop_id || undefined,
    sourceLink: item.source_link || order.source_link || undefined,
    rowPosition: undefined,
    _mera: order,
  }
}

export function adaptMeraOrder(order: MeraOrder): Order & { _mera: MeraOrder } {
  const item = order.items?.[0]
  if (item) {
    return adaptMeraOrderWithItem(order, item)
  }
  // Order-level fallback when no items
  return {
    itemId: order.order_id,
    sheetId: "__mera__",
    status: mapStatus(order.status),
    orderNote: order.note || undefined,
    designer: order.designer?.name || undefined,
    designLink: undefined,
    mockup: order.mockup_link || undefined,
    customerImage: undefined,
    personalization: undefined,
    date: order.created_at,
    store: order.store || undefined,
    productImage: undefined,
    productType: undefined,
    productName: undefined,
    country: order.shipping?.country || undefined,
    channel: order.channel || undefined,
    shopId: order.shop_id || undefined,
    sourceLink: order.source_link || undefined,
    rowPosition: undefined,
    _mera: order,
  }
}

export function adaptMeraOrders(orders: MeraOrder[]): Array<Order & { _mera: MeraOrder }> {
  const result: Array<Order & { _mera: MeraOrder }> = []
  for (const order of orders) {
    if (order.is_split_items && order.items && order.items.length > 0) {
      // Expand each item into its own CheckFlow entry
      for (const item of order.items) {
        result.push(adaptMeraOrderWithItem(order, item))
      }
    } else {
      result.push(adaptMeraOrder(order))
    }
  }
  return result
}
