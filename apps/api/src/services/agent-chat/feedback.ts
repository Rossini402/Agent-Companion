import { and, asc, desc, eq } from "drizzle-orm"
import { type Db, agentMessageFeedbacks, agentConversationMessages } from "@ai-companion/db"
import type { RecentFeedback } from "./build-prompt"

/** 校验：该消息是当前用户当前 Agent 的 assistant 消息且 completed，返回其 conversationId */
export async function findMessageForFeedback(
  db: Db,
  args: { userId: string; agentId: string; messageId: string },
): Promise<{ id: string; conversationId: string } | null> {
  const rows = await db
    .select({ id: agentConversationMessages.id, conversationId: agentConversationMessages.conversationId })
    .from(agentConversationMessages)
    .where(
      and(
        eq(agentConversationMessages.id, args.messageId),
        eq(agentConversationMessages.userId, args.userId),
        eq(agentConversationMessages.agentId, args.agentId),
        eq(agentConversationMessages.role, "assistant"),
        eq(agentConversationMessages.status, "completed"),
      ),
    )
    .limit(1)
  return rows[0] ?? null
}

/** upsert：先查后 update/insert（保留 created_at_ms），契合唯一索引 user_id+message_id */
export async function upsertFeedback(
  db: Db,
  args: {
    userId: string
    agentId: string
    conversationId: string
    messageId: string
    rating: "positive" | "negative"
    reason: string | null
    note: string | null
    nowMs: number
  },
): Promise<void> {
  const existing = await db
    .select({ id: agentMessageFeedbacks.id })
    .from(agentMessageFeedbacks)
    .where(and(eq(agentMessageFeedbacks.userId, args.userId), eq(agentMessageFeedbacks.messageId, args.messageId)))
    .limit(1)
  if (existing[0]) {
    await db
      .update(agentMessageFeedbacks)
      .set({ rating: args.rating, reason: args.reason, note: args.note, updatedAtMs: args.nowMs })
      .where(eq(agentMessageFeedbacks.id, existing[0].id))
    return
  }
  await db.insert(agentMessageFeedbacks).values({
    id: crypto.randomUUID(),
    userId: args.userId,
    agentId: args.agentId,
    conversationId: args.conversationId,
    messageId: args.messageId,
    rating: args.rating,
    reason: args.reason,
    note: args.note,
    createdAtMs: args.nowMs,
    updatedAtMs: args.nowMs,
  })
}

/** 恢复历史：会话消息（升序）leftJoin 当前用户反馈，回显每条 assistant 的 feedback */
export async function listMessagesWithFeedback(
  db: Db,
  args: { conversationId: string; userId: string; limit: number },
) {
  const rows = await db
    .select({
      id: agentConversationMessages.id,
      conversationId: agentConversationMessages.conversationId,
      agentId: agentConversationMessages.agentId,
      role: agentConversationMessages.role,
      content: agentConversationMessages.content,
      status: agentConversationMessages.status,
      createdAtMs: agentConversationMessages.createdAtMs,
      fbRating: agentMessageFeedbacks.rating,
      fbReason: agentMessageFeedbacks.reason,
      fbNote: agentMessageFeedbacks.note,
      fbUpdatedAtMs: agentMessageFeedbacks.updatedAtMs,
    })
    .from(agentConversationMessages)
    .leftJoin(
      agentMessageFeedbacks,
      and(
        eq(agentMessageFeedbacks.messageId, agentConversationMessages.id),
        eq(agentMessageFeedbacks.userId, args.userId),
      ),
    )
    .where(eq(agentConversationMessages.conversationId, args.conversationId))
    .orderBy(asc(agentConversationMessages.createdAtMs))
    .limit(args.limit)
  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversationId,
    agentId: r.agentId,
    role: r.role,
    content: r.content,
    status: r.status,
    createdAtMs: r.createdAtMs,
    feedback:
      r.fbRating && r.fbUpdatedAtMs != null
        ? { rating: r.fbRating, reason: r.fbReason, note: r.fbNote, updatedAtMs: r.fbUpdatedAtMs }
        : null,
  }))
}

/** 注入用：最近 N 条反馈（容错——异常返回空，不拖垮主回复） */
export async function listRecentFeedbacks(
  db: Db,
  args: { userId: string; agentId: string; limit: number },
): Promise<RecentFeedback[]> {
  try {
    const rows = await db
      .select({
        rating: agentMessageFeedbacks.rating,
        reason: agentMessageFeedbacks.reason,
        note: agentMessageFeedbacks.note,
        content: agentConversationMessages.content,
      })
      .from(agentMessageFeedbacks)
      .innerJoin(agentConversationMessages, eq(agentConversationMessages.id, agentMessageFeedbacks.messageId))
      .where(and(eq(agentMessageFeedbacks.userId, args.userId), eq(agentMessageFeedbacks.agentId, args.agentId)))
      .orderBy(desc(agentMessageFeedbacks.updatedAtMs))
      .limit(args.limit)
    return rows.map((r) => ({
      rating: r.rating,
      reason: r.reason,
      content: (r.note?.trim() || r.content).replace(/\s+/g, " ").slice(0, 120),
    }))
  } catch (err) {
    console.warn("feedback injection unavailable", err)
    return []
  }
}
