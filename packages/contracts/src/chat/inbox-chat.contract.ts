import { z } from "zod"

/** 单条 UI 消息（前端提交本轮上下文用） */
export const InboxChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
})
export type InboxChatMessage = z.infer<typeof InboxChatMessageSchema>

/** 可选的 LLM 配置覆盖（provider/model/温度等） */
export const InboxChatLlmConfigSchema = z.object({
  provider: z.string().min(1).max(80).optional(),
  model: z.string().min(1).max(120).optional(),
  temperature: z.number().min(0).max(2).optional(),
})
export type InboxChatLlmConfig = z.infer<typeof InboxChatLlmConfigSchema>

/** 聊天对象静态资料（单独作为一条 user message 注入 prompt） */
export const InboxChatConversationSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).max(120),
  handle: z.string().min(1).max(120),
  headline: z.string().min(1).max(200),
  lastActive: z.string().min(1).max(80),
  status: z.string().min(1).max(80),
  relationship: z.string().min(1).max(120),
  topic: z.string().min(1).max(120),
  chemistry: z.string().min(1).max(80),
  chemistryLabel: z.string().min(1).max(80),
  rhythm: z.string().min(1).max(80),
  profileNote: z.string().min(1).max(2000),
  imageKey: z.string().nullable().optional(),
})
export type InboxChatConversation = z.infer<typeof InboxChatConversationSchema>

/** 发送聊天请求。conversationId 关联服务端会话；conversation.id 作为 Agent 入口 */
export const InboxChatRequestSchema = z.object({
  conversationId: z.string().min(1).optional(),
  messages: z.array(InboxChatMessageSchema).min(1).max(20),
  llmConfig: InboxChatLlmConfigSchema.optional(),
  conversation: InboxChatConversationSchema,
})
export type InboxChatRequest = z.infer<typeof InboxChatRequestSchema>

/** 历史会话里的单条消息（恢复聊天窗口用） */
export const AgentConversationMessageSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  agentId: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  status: z.enum(["completed", "failed"]),
  createdAtMs: z.number().int().nonnegative(),
})
export type AgentConversationMessage = z.infer<typeof AgentConversationMessageSchema>

/** 恢复历史会话的响应。nextCursor 为 null 表示无更多历史 */
export const AgentConversationResponseSchema = z.object({
  conversationId: z.string().min(1),
  agentId: z.string().min(1),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  messageCount: z.number().int().nonnegative(),
  openingMessage: z.string().nullable(),
  messages: z.array(AgentConversationMessageSchema),
  nextCursor: z.string().nullable(),
})
export type AgentConversationResponse = z.infer<typeof AgentConversationResponseSchema>
