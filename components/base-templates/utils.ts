import type {
  BaseTemplateMatchCondition,
  BaseTemplateProductType,
  BaseTemplateVariant,
} from "@/types/mera-base-template"

// One reviewable row = a variant inside its product type.
export interface QueueEntry {
  key: string
  pt: BaseTemplateProductType
  variant: BaseTemplateVariant
}

export const entryKey = (pt: BaseTemplateProductType, v: BaseTemplateVariant) =>
  `${pt.project_id}|${pt.slug}|${v.variant_key}|${v.base_template_design}`

export const statusOf = (v: BaseTemplateVariant) => (v.base_template_status || "").trim().toUpperCase()

// Contract definition of "needs a human": has a design, not NEED REPAIR, and either never
// reviewed / REPAIRED, or has waiting orders. The backend sends `needs_review`; the
// fallback only covers a Mera build older than the checkflow contract.
export function needsReview(v: BaseTemplateVariant): boolean {
  if (typeof v.needs_review === "boolean") return v.needs_review
  const st = statusOf(v)
  if (!v.base_template_design?.trim() || st === "NEED REPAIR") return false
  return st === "" || st === "REPAIRED" || (v.pending_count ?? 0) > 0
}

// In the queue AND holding orders back right now — the default queue filter and the yellow
// sidebar count.
export const hasWaitingOrders = (v: BaseTemplateVariant) => needsReview(v) && (v.pending_count ?? 0) > 0

export const isNeedRepair = (v: BaseTemplateVariant) => statusOf(v) === "NEED REPAIR"

export const hasNewValues = (v: BaseTemplateVariant) => (v.pending_values ?? []).some((p) => !p.approved)

export function flattenEntries(
  pts: BaseTemplateProductType[],
  keep: (v: BaseTemplateVariant) => boolean
): QueueEntry[] {
  const out: QueueEntry[] = []
  for (const pt of pts) {
    for (const v of pt.variants ?? []) {
      if (!v.base_template_design?.trim()) continue
      if (keep(v)) out.push({ key: entryKey(pt, v), pt, variant: v })
    }
  }
  return out
}

// Variant counts shown on the sidebar / the Order Review card (GET /api/mera/base-templates/counts).
export interface BaseTemplateCounts {
  waiting: number // in the queue with waiting orders
  repair: number // NEED REPAIR — waiting for the designer
  // Mera reported more product types than one page holds → the numbers are a lower bound.
  partial: boolean
}

const formatCondition = (c: BaseTemplateMatchCondition) =>
  c.operator === "contains" ? `${c.field_name} chứa "${c.value}"` : `${c.field_name}: ${c.value}`

// condition_groups (OR of AND) wins over match_conditions; neither = catch-all.
export function conditionLines(v: BaseTemplateVariant): string[] {
  const groups = (v.condition_groups ?? []).filter((g) => g && g.length > 0)
  if (groups.length > 0) return groups.map((g) => g.map(formatCondition).join(" · "))
  const conds = v.match_conditions ?? []
  if (conds.length > 0) return [conds.map(formatCondition).join(" · ")]
  return []
}

export const CATCH_ALL_LABEL = "Mặc định / catch-all"

export function conditionSummary(v: BaseTemplateVariant): string {
  const lines = conditionLines(v)
  return lines.length === 0 ? CATCH_ALL_LABEL : lines.join("  HOẶC  ")
}

export const countriesLabel = (v: BaseTemplateVariant) =>
  v.countries && v.countries.length > 0 ? v.countries.join(", ") : "Mọi nước"

export const statusLabel = (status: string) => status || "Chưa duyệt"

// Keyboard shortcuts must not fire while the checker is typing.
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
}
