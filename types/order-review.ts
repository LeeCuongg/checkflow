import type { Order } from "@/types/order"
import type { Sheet } from "@/types/sheet"

export interface OrderReviewModalProps {
  isOpen: boolean
  onClose: () => void
  order: Order
  onAction: (
    action: "confirm" | "send_mockup" | "need_repair" | "skip",
    repairType?: "design_error" | "customer_change",
    note?: string,
  ) => void
  onOrderNoteUpdate?: (orderId: string, note: string) => void
  currentIndex: number
  totalCount: number
  selectedSheet?: Sheet
  onNext: () => void
  onPrevious: () => void
  onJumpToIndex: (index: number) => void // Added onJumpToIndex prop for direct navigation to specific order
  availableStatuses: string[]
  onStatusUpdate: (newStatus: Order["status"], note?: string, changeType?: "design_error" | "customer_change") => void
  reviewMode?: {
    isActive: boolean
    currentIndex: number
    orders: Order[]
  } | null
  isJumpLoading?: boolean // Added loading state for jump to order functionality
  // Sync state passed through from the review page (not used by the modal yet)
  syncStatus?: string
  pendingChanges?: number
  syncError?: string | null
  onManualSync?: () => void
}

export type ViewMode = "tabs" | "stack" | "float"
export type ActiveTab = "product" | "mockup" | "design" | "customer"

export interface OrderHistoryEntry {
  id: string
  orderId: string
  itemId: string
  status: string
  orderNote?: string
  changeType?: "design_error" | "customer_change"
  createdBy: {
    id: string
    name: string
    email: string
    role: string
  }
  createdAt: string
}

export interface OrderHistoryResponse {
  success: boolean
  data: {
    order: {
      id: string
      itemId: string
      googleSheetId: string
      sheetName?: string
    } | null
    history: OrderHistoryEntry[]
  }
}

export interface ProductHistoryEntry {
  id: string
  orderId: string
  itemId: string
  designer: string
  changeType: "design_error" | "customer_change"
  issueDescription: string
  createdAt: string
  createdBy: {
    id: string
    name: string
    email: string
  }
}

export interface ProductHistoryResponse {
  success: boolean
  data: {
    productType: string
    googleSheetId: string
    sheetName?: string
    totalRepairOrders: number
    orders: ProductHistoryEntry[]
  }
}

export interface ProductTypeNote {
  id: string
  productType: string
  content: string
  createdAt: string
  updatedAt: string
}

export interface ProductTypeNoteResponse {
  success: boolean
  data: ProductTypeNote | null
}
