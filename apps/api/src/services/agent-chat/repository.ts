import { and, desc, eq, sql } from "drizzle-orm"
import {
  type Db,
  agentConversations,
  agentConversationMessages,
  agentMemories,
  type AgentConversationRow,
  type AgentMemoryRow,
} from "@ai-companion/db"

/** 找到或创建用户 × Agent 的默认会话（v1 一对一） */
export async function getOrCreateConversation(
  db: Db,
  args: { userId: string; agentId: string; nowMs: number },
): Promise<AgentConversationRow> {
  const { userId, agentId, nowMs } = args
  const existing = await db
    .select()
    .from(agentConversations)
    .where(and(eq(agentConversations.userId, userId), eq(agentConversations.agentId, agentId)))
    .limit(1)
  if (existing[0]) return existing[0]

  const row: AgentConversationRow = {
    id: crypto.randomUUID(),
    userId,
    agentId,
    title: null,
    summary: null,
    messageCount: 0,
    lastMessageAtMs: null,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  }
  await db.insert(agentConversations).values(row)
  return row
}

/** 插入一条消息（用户消息先落库的核心） */
export async function insertMessage(
  db: Db,
  args: {
    id: string
    conversationId: string
    userId: string
    agentId: string
    role: "user" | "assistant"
    content: string
    status: "completed" | "failed"
    metadataJson?: string | null
    nowMs: number
  },
): Promise<void> {
  await db.insert(agentConversationMessages).values({
    id: args.id,
    conversationId: args.conversationId,
    userId: args.userId,
    agentId: args.agentId,
    role: args.role,
    content: args.content,
    status: args.status,
    metadataJson: args.metadataJson ?? null,
    createdAtMs: args.nowMs,
  })
}

/** 消息写入后更新会话状态（摘要可选、消息数、最近时间） */
export async function updateConversationAfterMessage(
  db: Db,
  args: {
    conversationId: string
    summary?: string | null
    messageCount: number
    lastMessageAtMs: number
    nowMs: number
  },
): Promise<void> {
  const patch: Partial<AgentConversationRow> = {
    messageCount: args.messageCount,
    lastMessageAtMs: args.lastMessageAtMs,
    updatedAtMs: args.nowMs,
  }
  if (args.summary !== undefined) patch.summary = args.summary
  await db.update(agentConversations).set(patch).where(eq(agentConversations.id, args.conversationId))
}

/** 读取最近 N 条消息（升序返回，供 prompt 顺序使用） */
export async function listRecentMessages(
  db: Db,
  args: { conversationId: string; limit: number },
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const rows = await db
    .select({ role: agentConversationMessages.role, content: agentConversationMessages.content })
    .from(agentConversationMessages)
    .where(eq(agentConversationMessages.conversationId, args.conversationId))
    .orderBy(desc(agentConversationMessages.createdAtMs))
    .limit(args.limit)
  return rows.reverse()
}

/** 读取 active 长期记忆，按 importance desc, updatedAt desc 排序（v1 无向量检索） */
export async function listActiveMemories(
  db: Db,
  args: { userId: string; agentId: string; limit: number },
): Promise<{ type: string; importance: number; content: string }[]> {
  return db
    .select({
      type: agentMemories.type,
      importance: agentMemories.importance,
      content: agentMemories.content,
    })
    .from(agentMemories)
    .where(
      and(
        eq(agentMemories.userId, args.userId),
        eq(agentMemories.agentId, args.agentId),
        eq(agentMemories.status, "active"),
      ),
    )
    .orderBy(
      sql`${agentMemories.importance} desc, ${agentMemories.updatedAtMs} desc`,
    )
    .limit(args.limit)
}

/** 记忆库列表（active + disabled，用于管理页面） */
export async function listMemoriesForManage(
  db: Db,
  args: { userId: string; agentId: string },
): Promise<AgentMemoryRow[]> {
  return db
    .select()
    .from(agentMemories)
    .where(
      and(
        eq(agentMemories.userId, args.userId),
        eq(agentMemories.agentId, args.agentId),
        sql`${agentMemories.status} in ('active','disabled')`,
      ),
    )
    .orderBy(sql`${agentMemories.importance} desc, ${agentMemories.updatedAtMs} desc`)
}
