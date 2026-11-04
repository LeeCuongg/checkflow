import type { Order } from "@/types/order"
import type { MeraOrder } from "@/types/mera-order"

// Orders with this many items, or this total quantity, need the customer to approve a
// mockup first: CONFIRMED on them becomes SEND MOCKUP.
export const LARGE_ORDER_THRESHOLD = 10

// Only Mera orders carry item counts / quantities; sheet orders never match.
export const isLargeOrder = (order: Order & { _mera?: MeraOrder }): boolean => {
  const mera = order._mera
  if (!mera) return false
  const items = mera.items ?? []
  const itemCount = Math.max(mera.items_count ?? 0, items.length)
  const quantity = Math.max(
    mera.total_quantity ?? 0,
    items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0),
  )
  return itemCount >= LARGE_ORDER_THRESHOLD || quantity >= LARGE_ORDER_THRESHOLD
}

export const applyLargeOrderRule = (order: Order, status: Order["status"]): Order["status"] =>
  status === "CONFIRMED" && isLargeOrder(order) ? "SEND MOCKUP" : status
