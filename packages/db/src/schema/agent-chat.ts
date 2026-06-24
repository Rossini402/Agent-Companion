import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core"

/** 会话主表：用户 × Agent 的默认会话容器（v1 一对一） */
export const agentConversations = sqliteTable(
  "agent_conversations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    agentId: text("agent_id").notNull(),
    title: text("title"),
    summary: text("summary"), // 滚动摘要，参与 prompt，非完整消息
    messageCount: integer("message_count").notNull().default(0),
    lastMessageAtMs: integer("last_message_at_ms"), // 首页列表排序
    createdAtMs: integer("created_at_ms").notNull(),
    updatedAtMs: integer("updated_at_ms").notNull(),
  },
  (t) => ({
    userAgentUnique: uniqueIndex("idx_agent_conversations_user_agent_unique").on(t.userId, t.agentId),
  }),
)

/** 消息流水：完整 user/assistant 对话原文（短期记忆来源） */
export const agentConversationMessages = sqliteTable(
  "agent_conversation_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    userId: text("user_id").notNull(),
    agentId: text("agent_id").notNull(),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    status: text("status", { enum: ["completed", "failed"] }).notNull(),
    metadataJson: text("metadata_json"), // token/模型/后续各层分析结果
    createdAtMs: integer("created_at_ms").notNull(), // 毫秒，分页游标
  },
  (t) => ({
    byConversation: index("idx_agent_messages_conversation").on(t.conversationId, t.createdAtMs),
  }),
)

/** 长期记忆：从对话抽取的结构化稳定信息 */
export const agentMemories = sqliteTable(
  "agent_memories",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    agentId: text("agent_id").notNull(),
    type: text("type").notNull(), // 偏好/边界/关系目标/对话风格/重要事实
    content: text("content").notNull(), // 提炼短文本，非原文复制
    importance: integer("importance").notNull().default(3), // 1–5，v1 注入优先级
    status: text("status", { enum: ["active", "disabled", "deleted"] }).notNull(),
    sourceMessageId: text("source_message_id"), // 追溯来源消息
    createdAtMs: integer("created_at_ms").notNull(),
    updatedAtMs: integer("updated_at_ms").notNull(),
  },
  (t) => ({
    byAgentStatus: index("idx_agent_memories_agent_status").on(t.userId, t.agentId, t.status),
  }),
)

export type AgentConversationRow = typeof agentConversations.$inferSelect
export type AgentConversationMessageRow = typeof agentConversationMessages.$inferSelect
export type AgentMemoryRow = typeof agentMemories.$inferSelect

/** 阶段4 · 消息反馈：一用户 × 一消息唯一一条（189） */
export const agentMessageFeedbacks = sqliteTable(
  "agent_message_feedbacks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    agentId: text("agent_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    messageId: text("message_id").notNull(),
    rating: text("rating", { enum: ["positive", "negative"] }).notNull(),
    reason: text("reason"),
    note: text("note"),
    createdAtMs: integer("created_at_ms").notNull(),
    updatedAtMs: integer("updated_at_ms").notNull(),
  },
  (t) => ({
    userMessageUnique: uniqueIndex("idx_agent_message_feedbacks_user_message_unique").on(t.userId, t.messageId),
    byAgentRecent: index("idx_agent_message_feedbacks_agent_recent").on(t.userId, t.agentId, t.updatedAtMs),
  }),
)

/** 阶段4 · 主动关怀计划：一用户 × 一 Agent 唯一一份（190） */
export const agentCarePlans = sqliteTable(
  "agent_care_plans",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    agentId: text("agent_id").notNull(),
    enabled: integer("enabled").notNull(),
    frequency: text("frequency", { enum: ["daily", "weekly", "custom"] }).notNull(),
    preferredTime: text("preferred_time"),
    scenesJson: text("scenes_json").notNull(),
    tone: text("tone", { enum: ["light", "gentle", "intimate"] }).notNull(),
    customPrompt: text("custom_prompt"),
    nextRunAtMs: integer("next_run_at_ms"),
    createdAtMs: integer("created_at_ms").notNull(),
    updatedAtMs: integer("updated_at_ms").notNull(),
  },
  (t) => ({
    userAgentUnique: uniqueIndex("idx_agent_care_plans_user_agent_unique").on(t.userId, t.agentId),
    byNextRun: index("idx_agent_care_plans_next_run").on(t.enabled, t.nextRunAtMs),
  }),
)

/** 阶段4 · 主动关怀事件：每次生成一条，绑定真实 assistant 消息（190） */
export const agentCareEvents = sqliteTable(
  "agent_care_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    agentId: text("agent_id").notNull(),
    carePlanId: text("care_plan_id"),
    conversationId: text("conversation_id").notNull(),
    messageId: text("message_id").notNull(),
    scene: text("scene").notNull(),
    status: text("status", { enum: ["generated", "read"] }).notNull(),
    message: text("message").notNull(),
    metadataJson: text("metadata_json"),
    generatedAtMs: integer("generated_at_ms").notNull(),
    readAtMs: integer("read_at_ms"),
  },
  (t) => ({
    byAgentGenerated: index("idx_agent_care_events_agent_generated").on(t.userId, t.agentId, t.generatedAtMs),
    byMessage: index("idx_agent_care_events_message").on(t.messageId),
  }),
)

export type AgentMessageFeedbackRow = typeof agentMessageFeedbacks.$inferSelect
export type AgentCarePlanRow = typeof agentCarePlans.$inferSelect
export type AgentCareEventRow = typeof agentCareEvents.$inferSelect
