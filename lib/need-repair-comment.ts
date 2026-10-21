// Status message checkflow drops into a Discussion each time something is sent to NEED REPAIR,
// so a thread that went through several repair rounds reads as rounds: every comment after a
// marker belongs to that round. Stored as a plain order_comments row (Mera's Discussion panel
// reads the same table), recognised by its first line.
//
// Format (first line = marker, rest = the checker's note):
//   🔧 NEED REPAIR · lần 2 · Design error
//   <note>

export const NEED_REPAIR_MARKER = "🔧 NEED REPAIR"

export type RepairChangeType = "design_error" | "customer_change"

const CHANGE_TYPE_LABEL: Record<RepairChangeType, string> = {
  design_error: "Design error",
  customer_change: "Customer change",
}

export function buildNeedRepairCommentText({
  round,
  changeType,
  scope,
  note,
}: {
  round: number
  changeType?: RepairChangeType | null
  // Extra tag after the change type, e.g. "Base template".
  scope?: string | null
  note?: string | null
}): string {
  const head = [NEED_REPAIR_MARKER, `lần ${round}`]
  if (changeType) head.push(CHANGE_TYPE_LABEL[changeType])
  if (scope) head.push(scope)
  const body = (note ?? "").trim()
  return body ? `${head.join(" · ")}\n${body}` : head.join(" · ")
}

export interface ParsedNeedRepairComment {
  title: string // first line without the marker, e.g. "lần 2 · Design error"
  note: string
}

export function parseNeedRepairComment(text: string | null | undefined): ParsedNeedRepairComment | null {
  if (!text || !text.startsWith(NEED_REPAIR_MARKER)) return null
  const nl = text.indexOf("\n")
  const first = nl === -1 ? text : text.slice(0, nl)
  const title = first.slice(NEED_REPAIR_MARKER.length).replace(/^\s*·\s*/, "").trim()
  return { title, note: nl === -1 ? "" : text.slice(nl + 1).trim() }
}
