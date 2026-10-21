import type { SupabaseClient } from "@supabase/supabase-js"
import { publishToChannel } from "@/lib/ably-client"
import { logServerError } from "@/lib/server-sentry"
import { NEED_REPAIR_MARKER, buildNeedRepairCommentText, type RepairChangeType } from "@/lib/need-repair-comment"

interface PostNeedRepairCommentParams {
  // Discussion key: order item_key, or baseTemplateCommentKey(...) for a base template.
  itemKey: string
  actor: { id: string; email: string; name?: string | null }
  changeType?: RepairChangeType | null
  scope?: string | null
  note?: string | null
}

/**
 * Appends the NEED REPAIR status message to a Discussion (see lib/need-repair-comment.ts), as
 * the checker who marked it. Best effort: the status change already happened, so a failure here
 * is logged and swallowed — never turns a successful NEED REPAIR into an error.
 */
export async function postNeedRepairComment(
  supabase: SupabaseClient,
  { itemKey, actor, changeType, scope, note }: PostNeedRepairCommentParams
): Promise<void> {
  try {
    const [{ count }, { data: user }] = await Promise.all([
      supabase
        .from("order_comments")
        .select("id", { count: "exact", head: true })
        .eq("order_item_id", itemKey)
        .like("comment_text", `${NEED_REPAIR_MARKER}%`),
      supabase.from("users").select("name, avatar_url").eq("id", actor.id).maybeSingle(),
    ])

    const { data: comment, error } = await supabase
      .from("order_comments")
      .insert({
        order_item_id: itemKey,
        user_email: actor.email,
        user_name: user?.name || actor.name || actor.email,
        user_avatar: user?.avatar_url || null,
        comment_text: buildNeedRepairCommentText({ round: (count ?? 0) + 1, changeType, scope, note }),
      })
      .select()
      .single()
    if (error) throw error

    await publishToChannel(`order-comments:${itemKey}`, "comment:new", comment)
  } catch (err) {
    logServerError(err as Error, { context: "postNeedRepairComment", itemKey })
  }
}
