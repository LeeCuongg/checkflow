export interface MeraDesigner {
  id: string
  name: string
}

export interface MeraCustomer {
  name: string
  email: string
}

export interface MeraShipping {
  name: string
  street: string
  city: string
  state: string
  zip_code: string
  country: string
}

export interface MeraPricing {
  currency: string
  subtotal: string
  discount: string
  total: string
}

export interface MeraTracking {
  code: string
  carrier: string
  url: string
}

export interface MeraOrder {
  id?: string
  order_id: string
  channel: string
  shop_id: string
  etsy_account: string
  store: string
  project_id: string
  status: string
  note: string
  provider: string
  material: string
  designer: MeraDesigner
  customer: MeraCustomer
  shipping: MeraShipping
  pricing: MeraPricing
  source_link: string
  vat_ioss: string
  export_count: number
  mockup_link: string
  fulfillment_cost: string
  tracking: MeraTracking
  ff_name_by_day: string
  is_split_items: boolean
  is_deleted: boolean
  deleted_at: string | null
  deleted_by: string
  last_changed_fields: string[]
  last_updated_source: string
  version: number
  created_at: string
  updated_at: string
  updated_by: string
  items_count?: number
  total_quantity?: number
  items?: MeraOrderItem[]
}

export interface MeraOrderItem {
  id?: string
  item_key: string
  order_id: string
  etsy_line_item_id: string
  status: string
  note: string
  provider: string
  material: string
  image_link: string
  source_cost: string
  quantity: number
  product_name: string
  personalization: string
  product_type: string
  design_link: string
  customer_image: string
  mockup_link: string
  source_link?: string
  tracking: MeraTracking
  designer?: MeraDesigner
  version: number
  created_at: string
  updated_at: string
}

export interface MeraProject {
  id: string
  name: string
  team_member_ids: string[]
}

export interface MeraListOrdersParams {
  page?: number
  page_size?: number
  channel?: string
  status?: string
  statuses?: string[]
  store?: string
  provider?: string
  designer?: string
  project_id?: string
  q?: string
  include_items?: boolean
  /** Format YYYY-MM-DD */
  date_from?: string
  /** Format YYYY-MM-DD */
  date_to?: string
}

export interface MeraListOrdersResponse {
  orders: MeraOrder[]
  total: number
  page: number
  page_size: number
  total_pages: number
  status_counts?: Record<string, number>
}

export interface MeraPatchOrderBody {
  version: number
  note?: string
  provider?: string
  material?: string
  customer?: Partial<MeraCustomer>
  shipping?: Partial<MeraShipping>
  pricing?: Partial<MeraPricing>
  tracking?: Partial<MeraTracking>
  channel?: string
  store?: string
  source_link?: string
  vat_ioss?: string
  etsy_account?: string
  mockup_link?: string
  fulfillment_cost?: string
  export_count?: number
  ff_name_by_day?: string
  is_split_items?: boolean
  is_deleted?: boolean
  personalization?: string
}

export interface MeraPatchItemBody {
  version: number
  status?: string
  provider?: string
  material?: string
  product_name?: string
  quantity?: number
  image_link?: string
  source_cost?: string
  product_type?: string
  design_link?: string
  customer_image?: string
  mockup_link?: string
  tracking?: Partial<MeraTracking>
  personalization?: string
  designer?: Partial<MeraDesigner>
}

export interface MeraBulkPatchItemsBody {
  item_keys: string[]
  fields: Omit<MeraPatchItemBody, "version">
}

export interface MeraActor {
  id: string
  email: string
}

export interface MeraApiError extends Error {
  status: number
  detail?: unknown
}
