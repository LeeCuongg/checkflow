// Types for the /base-templates review screen.
//
// Mirrors Mera fulfill `GET /api/v1/base-templates` + `POST /api/v1/projects/:id/base-template/*`
// + `GET /api/v1/base-template-settings` 1:1 (Go json tags). Source of truth:
//   - Mera `_workspace/bt-checkflow/02_api_contract.md` (2026-09-29)
//   - Mera `mera-fulfill-frontend/src/types/baseTemplate.ts` (fields that existed before)
// Fields marked optional are `omitempty` on the backend (or absent on a backend deployed
// before the checkflow contract) — always read them with `?? []` / `?? false`.

// Order statuses that count as "waiting for review" for a variant. SUPPORT CHECK only
// survives until the Mera migration retires it.
export const BASE_TEMPLATE_PENDING_STATUSES = ["DESIGNED", "REPAIRED", "SUPPORT CHECK"] as const

export interface BaseTemplateHistoryEntry {
  status: string
  design_link?: string
  actor_email?: string
  at: string
  note?: string // fulfill's "what to fix" instruction on a NEED REPAIR
}

export interface BaseTemplateMatchCondition {
  field_name: string
  value: string
  // absent = "equals" (exact, trimmed, case-insensitive)
  operator?: "equals" | "contains"
}

// One personalization-value signature among the variant's waiting orders.
export interface BaseTemplatePendingValue {
  signature: string // V3 signature — sent back VERBATIM on confirm ("" is a valid signature)
  label: string // human readable ("Choose: 14oz"); "" signature → "(không có trường phân biệt)"
  count: number // waiting orders carrying this signature
  approved: boolean // already in approved_signatures (leftover orders from while the switch was OFF)
  sample_item_key: string
  // Photo (image_link, fallback image) of sample_item_key. omitempty — absent on older backends.
  image_link?: string
}

export interface BaseTemplateVariant {
  variant_key: string
  match_conditions?: BaseTemplateMatchCondition[]
  // OR-of-AND. When present it REPLACES match_conditions as the variant's rule.
  condition_groups?: BaseTemplateMatchCondition[][]
  // ISO alpha-2; absent = default card (every country)
  countries?: string[]
  base_template_design: string
  base_template_mockup: string
  base_template_status: string // "" | "CONFIRMED" | "NEED REPAIR" | "REPAIRED"
  designer: string
  pending_count: number
  pending_item_key: string
  // Product photos of orders that this variant's rule SELECTS (as on Mera's Production SKU
  // screen; fallback: orders on the same design_link). Up to 4, deduped. omitempty.
  image_links?: string[]
  history?: BaseTemplateHistoryEntry[]
  approved_signatures?: string[]
  // New (checkflow contract). Not omitempty on the new backend; optional here only so an
  // older backend (key absent) degrades instead of crashing.
  needs_review?: boolean
  pending_values?: BaseTemplatePendingValue[]
}

export interface BaseTemplateSignatureConfig {
  excluded_fields?: string[]
  included_fields?: string[]
  updated_by?: string
  updated_at?: string
}

export interface BaseTemplateProductType {
  product_type_id: string
  project_id: string
  project_name: string
  slug: string
  display_name: string
  version: number
  pt_status: string
  image_links?: string[] // the product type's own photos (designer-side), up to 8. omitempty.
  variants: BaseTemplateVariant[]
  signature_supported?: boolean
  signature_config?: BaseTemplateSignatureConfig
  observed_fields?: string[]
}

export interface BaseTemplateListResponse {
  items: BaseTemplateProductType[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface BaseTemplateListParams {
  project_id?: string
  status?: string // variant-level filter, e.g. "NEED REPAIR"
  pending?: boolean
  queue?: boolean // only product types with ≥1 variant needing review
  nocache?: boolean // bypass the 60s list cache on the Mera side
  search?: string
  page?: number
  limit?: number
}

// ── POST /api/v1/projects/:id/base-template/confirm ──
export interface BaseTemplateConfirmBody {
  product_type: string
  design_link: string
  // Key present (even []) = new mode: learn + cascade. Key absent = legacy flag-only.
  signatures: string[]
  expected_status?: string
}

// ── POST /api/v1/projects/:id/base-template/need-repair ──
export interface BaseTemplateNeedRepairBody {
  product_type: string
  design_link: string
  note: string
}

// DesignConfirmResult (+ checkflow fields). Counters / booleans are not omitempty.
export interface BaseTemplateActionResult {
  affected_count: number
  skipped_count?: number
  auto_status_enabled?: boolean
  action: string
  design_link?: string
  product_type?: string
  approved_signatures?: string[]
  flag_warning?: string
}

// 409 body when expected_status no longer matches.
export interface BaseTemplateConflictBody {
  error: string
  code?: string // "base_template_status_conflict"
  current_status?: string
}

// ── checkflow proxy request bodies (project_id travels in the body, not the path) ──
export interface CheckflowBaseTemplateConfirmRequest extends BaseTemplateConfirmBody {
  project_id: string
}

export interface CheckflowBaseTemplateNeedRepairRequest extends BaseTemplateNeedRepairBody {
  project_id: string
}

// ── GET /api/v1/base-template-settings ──
export interface BaseTemplateSettingsChange {
  enabled: boolean
  at: string
  by?: string
}

export interface BaseTemplateSettings {
  auto_status_enabled: boolean
  updated_at?: string
  updated_by?: string
  history?: BaseTemplateSettingsChange[]
}
